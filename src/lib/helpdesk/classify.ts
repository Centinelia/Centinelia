/**
 * Auto-clasificador de tickets de helpdesk. Aplica [[feedback-empleados-inteligentes]]:
 * el empleado (Neo/helpdesk agent) infiere categoría + prioridad del ticket
 * en vez de pedir al usuario que llene dropdowns.
 *
 * Fail-open: si el modelo falla (timeout, JSON malo, error de red), caemos a
 * ('otro', 'normal') — no bloqueamos la creación del ticket porque el
 * classifier tuvo un mal día.
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 6_000;

export type TicketCategory = 'red' | 'servidores' | 'usuario' | 'software' | 'hardware' | 'accesos' | 'otro';
export type TicketPriority = 'baja' | 'normal' | 'alta' | 'critica';

const VALID_CATEGORIES = new Set<TicketCategory>(['red', 'servidores', 'usuario', 'software', 'hardware', 'accesos', 'otro']);
const VALID_PRIORITIES = new Set<TicketPriority>(['baja', 'normal', 'alta', 'critica']);

export interface ClassifiedTicket {
  categoria: TicketCategory;
  prioridad: TicketPriority;
  source:    'llm' | 'fallback';
  reason?:   string;
}

const SYSTEM_PROMPT = `Eres el clasificador de tickets de helpdesk IT del negocio. Recibes el título y descripción de una solicitud reportada por un usuario y respondes SOLO con JSON: { "categoria": "...", "prioridad": "...", "reason": "..." }.

CATEGORÍAS (elige UNA):
- red — internet caído, wifi, VPN, conectividad de oficina
- servidores — servidor caído, base de datos, deploys, infraestructura backend
- usuario — cuenta bloqueada, password reset, permisos de usuario específico
- software — apps no funcionan, bugs de aplicación, errores en programas
- hardware — computadora no prende, monitor, teclado, impresora, dispositivo físico
- accesos — no puede entrar a un sistema, credenciales, MFA, permisos genéricos
- otro — cuando ninguna aplica claramente

PRIORIDADES (elige UNA):
- critica — afecta a todo el negocio o bloquea operación (servidor caído, red caída completa, sistema fiscal muerto en día de cierre)
- alta — afecta a múltiples usuarios o bloquea trabajo importante de un usuario (impresora rota, no puede acceder al ERP, wifi intermitente)
- normal — afecta a un usuario en tareas cotidianas pero puede seguir trabajando (email lento, programa se cierra a veces)
- baja — consulta, mejora, o problema menor sin urgencia (¿cómo hago X?, cambio estético)

REGLA: sé decidido. En duda entre 2 categorías, elige la más específica. En duda entre 2 prioridades, elige la más baja (subir siempre es fácil, bajar molesta al reportante).

reason: 1 frase corta explicando por qué elegiste esa categoría + prioridad.`;

interface ClassifyInput {
  titulo:       string;
  descripcion?: string | null;
}

export async function classifyTicket(input: ClassifyInput): Promise<ClassifiedTicket> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    const resp = await anthropic.messages.create(
      {
        model:      MODEL,
        max_tokens: 200,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Título: ${input.titulo}\n${input.descripcion?.trim() ? `Descripción: ${input.descripcion.trim().slice(0, 800)}` : '(sin descripción adicional)'}`,
        }],
      },
      { signal: controller.signal },
    );
    void logLlmCall({ source: 'helpdesk_classify', model: MODEL, usage: resp.usage, latencyMs: Date.now() - started });

    const block = resp.content.find(b => b.type === 'text');
    const raw   = block?.type === 'text' ? block.text.trim() : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback('classifier_no_json');

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const rawCat = typeof parsed.categoria === 'string' ? parsed.categoria.toLowerCase().trim() : '';
    const rawPri = typeof parsed.prioridad === 'string' ? parsed.prioridad.toLowerCase().trim() : '';

    return {
      categoria: VALID_CATEGORIES.has(rawCat as TicketCategory) ? (rawCat as TicketCategory) : 'otro',
      prioridad: VALID_PRIORITIES.has(rawPri as TicketPriority) ? (rawPri as TicketPriority) : 'normal',
      source:    'llm',
      reason:    typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : undefined,
    };
  } catch (err) {
    void logLlmCall({
      source: 'helpdesk_classify', model: MODEL,
      usage: { input_tokens: 0, output_tokens: 0 },
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback('classifier_error');
  } finally {
    clearTimeout(timer);
  }
}

function fallback(reason: string): ClassifiedTicket {
  return { categoria: 'otro', prioridad: 'normal', source: 'fallback', reason };
}
