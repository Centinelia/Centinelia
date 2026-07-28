import Anthropic from '@anthropic-ai/sdk';
import { saveLearnings } from '@/lib/ai/save-learning';

const anthropic = new Anthropic();

interface Message {
  role:    'user' | 'assistant';
  content: string | unknown;
}

function extractUserTexts(messages: Message[]): string[] {
  return messages
    .filter(m => m.role === 'user')
    .map(m => {
      if (typeof m.content === 'string') return m.content.trim();
      if (Array.isArray(m.content)) {
        return (m.content as { type: string; text?: string }[])
          .filter(b => b.type === 'text')
          .map(b => b.text ?? '')
          .join(' ')
          .trim();
      }
      return '';
    })
    .filter(t => t.length > 0);
}

/**
 * After a chat session, look at what the owner instructed and extract
 * any implicit standing rules that should persist as learnings.
 * Fire-and-forget — never throws.
 */
export async function extractChatLearnings(opts: {
  agentId:     string;
  portalEmail: string | null;
  agentName:   string;
  agentRole:   string;
  messages:    Message[];
}): Promise<void> {
  const { agentId, portalEmail, agentName, agentRole, messages } = opts;

  // Only process substantial sessions (at least 4 user messages)
  const userTexts = extractUserTexts(messages);
  if (userTexts.length < 4) return;

  const conversationSummary = userTexts
    .slice(-8)    // last 8 user messages
    .map((t, i) => `${i + 1}. ${t.slice(0, 200)}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: [{
      type: 'text',
      text: `Eres un extractor de preferencias y reglas implícitas del dueño de un negocio.

TAREA:
Identifica si en las instrucciones dadas hay REGLAS IMPLÍCITAS que el empleado debería recordar para futuras sesiones — preferencias estables del dueño, no instrucciones de una sola vez.

Ejemplos de reglas que SÍ vale la pena extraer:
- "El dueño siempre quiere que las propuestas incluyan término de pago a 30 días"
- "Al generar correos formales, el dueño prefiere tuteo"
- "Las cotizaciones deben incluir 3 opciones de precio"

Ejemplos de lo que NO extraer:
- Instrucciones específicas de esta sesión ("envía este correo a Juan")
- Información puntual ("la reunión es el martes")
- Cosas que ya son obvias del rol

Para cada aprendizaje, clasifícalo:
- "role_kb": preferencia o procedimiento que el empleado debe recordar para hacer mejor su trabajo.
- "guardrails": límite de autoridad que el dueño dejó claro (qué no hacer sin preguntar, cuándo escalar, qué no aprobar solo).

Responde ÚNICAMENTE con JSON:
{
  "learnings": [
    { "content": "Regla clara y accionable", "confidence": 0.88, "category": "role_kb" }
  ]
}

Máximo 2 aprendizajes. Si no hay reglas generalizables, responde con learnings vacío. Las reglas deben ser frases que el empleado pueda aplicar en sesiones futuras.`,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{
      role: 'user',
      content: `EMPLEADO: ${agentName} (${agentRole || 'Asistente de oficina'})

ÚLTIMAS INSTRUCCIONES DEL DUEÑO EN ESTA SESIÓN:
${conversationSummary}`,
    }],
  });

  const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return;

  let parsed: { learnings?: unknown[] };
  try { parsed = JSON.parse(match[0]); } catch { return; }

  const extracted = (parsed.learnings ?? [])
    .filter((l): l is { content: string; confidence: number; category: 'role_kb' | 'guardrails' } =>
      typeof (l as any)?.content === 'string' &&
      (l as any).content.trim().length > 10 &&
      typeof (l as any)?.confidence === 'number' &&
      ['role_kb', 'guardrails'].includes((l as any)?.category),
    )
    .slice(0, 2);

  if (!extracted.length) return;

  await saveLearnings(
    extracted.map(e => ({
      agentId,
      portalEmail,
      content:    e.content.trim().slice(0, 500),
      confidence: Math.min(1, Math.max(0, e.confidence)),
      category:   e.category,
      source:     'chat' as const,
    })),
  );
}
