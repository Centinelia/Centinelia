import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

/**
 * Auto-mode classifier — extiende el patrón de verifier.ts (F4.1) para
 * decidir si un draft de correo es seguro enviar sin humano.
 *
 * Fail-closed en cada modo de fallo: cualquier error, timeout, o duda
 * razonable retorna decision='human' con signal descriptivo. Nunca
 * retorna 'send' bajo incertidumbre.
 *
 * Spec: docs/superpowers/specs/2026-07-30-email-auto-mode-classifier-design.md
 */

export type AutoModeDecision = 'send' | 'human' | 'block';

export interface ClassifyOpts {
  draft:            string;
  emailFrom:        string;
  emailSubject:     string;
  emailBody:        string;
  category:         string;
  agentName:        string;
  businessName:     string;
  businessContext?: string | null;
  agentRole?:       string | null;
}

export interface AutoModeVerdict {
  decision: AutoModeDecision;
  reason:   string;
  signals:  string[];
}

const CLASSIFIER_TIMEOUT_MS = 10_000;
const MODEL = 'claude-haiku-4-5-20251001';

const CLASSIFIER_SYSTEM = `Actúas como red de seguridad del empleado de un negocio. El empleado redactó una respuesta a un correo. Tu única tarea es decidir: mandar sin humano ('send'), escalar a humano ('human'), o bloquear ('block').

Decide 'human' SIEMPRE si detectas:
- Compromisos que exceden autoridad estándar del empleado: descuentos, plazos de entrega no estándar, garantías, condiciones no habituales del negocio
- Signos de queja grave, cliente molesto, o mención legal / demanda / abogado
- **FABRICACIÓN DE HORARIOS PARA REUNIÓN/CITA**: draft propone slots específicos ("mañana 10 AM, mañana 3 PM, jueves 11 AM") sin evidencia de haber consultado calendario real. Los horarios de reunión SIEMPRE requieren verificación humana o tool de calendario.
- **FABRICACIÓN DE POLÍTICA DEL NEGOCIO**: draft afirma "por confidencialidad no podemos...", "nuestra política es...", "no ofrecemos X debido a..." u otra afirmación sobre políticas/reglas del negocio. Estas políticas rara vez están documentadas y el empleado puede estar inventando.
- **FABRICACIÓN DE REFERENCIAS/CASOS**: draft menciona casos de éxito específicos, testimonios, clientes atendidos, proyectos previos, sin evidencia de haber consultado Drive/base de conocimiento.

Decide 'block' SIEMPRE si detectas:
- Draft revela datos personales de terceros (RFC, CURP, INE, cuentas bancarias ajenas)
- Draft acepta actividad ilegal, fraude, cobranza abusiva, extorsión
- Draft dirigido a target obviamente incorrecto (interno del negocio, contacto ajeno al hilo)

Decide 'send' si el draft es una respuesta rutinaria, informativa, o cortés SIN las 3 fabricaciones anteriores. Ejemplos válidos:
- Acuse de recibo genérico ("Recibí tu correo, lo revisamos y respondemos")
- Info del negocio que probablemente está en knowledge base (horarios de atención, ubicación, servicios generales)
- Datos de producto/precio que suenan consistentes con la operación normal del negocio
- Redirección a otra persona/canal
- Preguntas de aclaración al cliente
- Compromiso de acción vaga sin fecha concreta ("te contactamos pronto", "revisamos y respondemos")

En duda razonable entre 'human' y 'send' — solo escala si hay una de las 3 fabricaciones específicas. Un draft cortés con info que "suena razonable" NO es fabricación por sí solo; solo si menciona horarios de cita, política inventada, o referencias específicas.

Signals sugeridos: commitment, complaint_tone, personal_data, illegal_activity, wrong_target, tone_aggressive, routine, unverified_meeting_time, unverified_policy, unverified_reference.

Responde SOLO JSON válido, sin markdown:
{ "decision": "send"|"human"|"block", "reason": "razón breve", "signals": ["tag1", "tag2"] }`;

function sanitizeSignals(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length < 60)
    .slice(0, 8);
}

function failClosed(signal: string, reason = 'Verificación no disponible'): AutoModeVerdict {
  return { decision: 'human', reason, signals: [signal] };
}

export async function classifyEmailDraft(opts: ClassifyOpts): Promise<AutoModeVerdict> {
  const userContent = [
    `AGENTE: ${opts.agentName} (${opts.businessName})`,
    opts.agentRole ? `ROL: ${opts.agentRole}` : '',
    opts.businessContext ? `\nCONTEXTO NEGOCIO:\n${opts.businessContext.slice(0, 600)}` : '',
    `\n---\nCORREO ENTRANTE`,
    `De: ${opts.emailFrom}`,
    `Asunto: ${opts.emailSubject}`,
    `Categoría detectada: ${opts.category}`,
    `Cuerpo: ${opts.emailBody.slice(0, 1500)}`,
    `\n---\nDRAFT PROPUESTO POR EL EMPLEADO:`,
    opts.draft.slice(0, 2000),
  ].filter(Boolean).join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  const __t = Date.now();
  try {
    const resp = await anthropic.messages.create(
      {
        model:      MODEL,
        max_tokens: 250,
        system: [{ type: 'text', text: CLASSIFIER_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent }],
      },
      { signal: controller.signal },
    );
    void logLlmCall({ source: 'email_classifier', model: MODEL, usage: resp.usage, latencyMs: Date.now() - __t, meta: { category: opts.category } });

    const textBlock = resp.content.find(b => b.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return failClosed('classifier_bad_json', 'Respuesta sin JSON');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return failClosed('classifier_bad_json', 'JSON no parseable');
    }

    const decisionRaw = parsed.decision;
    if (decisionRaw !== 'send' && decisionRaw !== 'human' && decisionRaw !== 'block') {
      return failClosed('classifier_invalid_decision', `Decisión inválida: ${String(decisionRaw)}`);
    }

    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '';
    const signals = sanitizeSignals(parsed.signals);

    return { decision: decisionRaw, reason, signals };

  } catch (err: unknown) {
    void logLlmCall({ source: 'email_classifier', model: MODEL, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { category: opts.category } });
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const anthropicErr = err as { status?: number };
    if (isAbort) return failClosed('classifier_timeout', 'Timeout');
    if (anthropicErr?.status === 429) return failClosed('classifier_rate_limit', 'Rate limit');
    if (anthropicErr?.status && anthropicErr.status >= 500) return failClosed('classifier_5xx', 'Anthropic 5xx');
    console.error('[auto-mode classifier] error:', err);
    return failClosed('classifier_error', 'Excepción no capturada');
  } finally {
    clearTimeout(timer);
  }
}
