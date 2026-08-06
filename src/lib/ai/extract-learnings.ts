import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

export async function extractAndSaveLearnings(opts: {
  agentId:       string;
  portalEmail:   string;
  vapiCallId:    string | null;
  transcript:    string;
  knowledgeBase: string | null;
}): Promise<void> {
  const { agentId, portalEmail, vapiCallId, transcript, knowledgeBase } = opts;

  // Skip if agent already has too many pending learnings (avoid flooding)
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('agent_learnings')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('status', 'pending');
  if ((count ?? 0) >= 10) return;

  const opsResult = await consumeAiOp(agentId, 1, { source: 'extract_learnings', label: 'Extracción de aprendizajes de conversación' });
  if (!opsResult.ok) return;

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  let response;
  try {
    response = await anthropic.messages.create({
    model:      __m,
    max_tokens: 600,
    system: [{
      type: 'text',
      text: `Analiza conversaciones telefónicas de negocios y extrae aprendizajes.

Tu tarea: identifica máximo 3 aprendizajes nuevos, concretos y verificables que el agente debería recordar y que NO estén ya en su base de conocimiento. Para cada uno, clasifícalo:
- "role_kb": nueva información, procedimiento o hecho relevante para el puesto.
- "guardrails": algo que el agente hizo o dijo sin autorización, un límite que cruzó, o una situación que debió escalar y no lo hizo.

Ejemplos:
- { "content": "Varios clientes preguntan por descuento de pago anual", "category": "role_kb" }
- { "content": "El agente ofreció un descuento sin tener autorización para hacerlo", "category": "guardrails" }
- { "content": "La sucursal norte atiende solo de lunes a viernes", "category": "role_kb" }

NO incluyas: opiniones generales, cosas ya documentadas, ni suposiciones.
Si no hay nada nuevo, responde: []

Responde SOLO con un JSON array en español mexicano.`,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{
      role: 'user',
      content: `BASE DE CONOCIMIENTO ACTUAL DEL AGENTE:
${knowledgeBase?.slice(0, 2000) || '(vacía)'}

TRANSCRIPT DE LA LLAMADA:
${transcript.slice(0, 4000)}`,
    }],
  });
    void logLlmCall({ source: 'extract_learnings', model: __m, usage: response.usage, agentId, portalEmail, latencyMs: Date.now() - __t, meta: { vapiCallId } });
  } catch (err) {
    void logLlmCall({ source: 'extract_learnings', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId, portalEmail, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { vapiCallId } });
    throw err;
  }

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

  type RawLearning = { content: string; category: 'role_kb' | 'guardrails' };
  let learnings: RawLearning[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    learnings = match
      ? (JSON.parse(match[0]) as unknown[]).filter(
          (l): l is RawLearning =>
            typeof (l as any)?.content === 'string' &&
            (l as any).content.trim().length > 10 &&
            ['role_kb', 'guardrails'].includes((l as any)?.category),
        )
      : [];
  } catch {
    return;
  }
  if (!learnings.length) return;

  const items = learnings.slice(0, 3).map(({ content, category }) => ({
    agent_id:     agentId,
    portal_email: portalEmail,
    vapi_call_id: vapiCallId,
    content:      content.trim().slice(0, 500),
    category,
    status:       'pending',
    source:       'call',
  }));

  await supabase.from('agent_learnings').insert(items);

  // Mirror learnings into team feed so the team sees what the agent picked up
  await supabase.from('agent_messages').insert(
    items.map(item => ({
      portal_email:  portalEmail,
      from_agent_id: agentId,
      to_agent_id:   null,
      vapi_call_id:  vapiCallId,
      type:          'learning',
      content:       item.content,
      metadata:      {},
    })),
  );
}
