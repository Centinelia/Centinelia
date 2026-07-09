import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

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

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Analiza esta conversación telefónica de negocios.

BASE DE CONOCIMIENTO ACTUAL DEL AGENTE:
${knowledgeBase?.slice(0, 2000) || '(vacía)'}

TRANSCRIPT DE LA LLAMADA:
${transcript.slice(0, 4000)}

Tu tarea: identifica máximo 3 datos nuevos, concretos y verificables que el agente debería recordar para futuras llamadas y que NO estén ya en su base de conocimiento.

Ejemplos de buenos aprendizajes:
- "El cliente mencionó que su competidor ofrece el mismo servicio a precio menor"
- "Varios clientes preguntan por descuentos para pago anual"
- "La sucursal norte atiende solo de lunes a viernes"

NO incluyas: opiniones generales, cosas ya documentadas, ni suposiciones del agente.
Si no hay nada nuevo concreto, responde exactamente: []

Responde SOLO con un JSON array de strings en español mexicano:`,
    }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

  let learnings: string[] = [];
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    learnings = match
      ? (JSON.parse(match[0]) as unknown[]).filter(
          (l): l is string => typeof l === 'string' && l.trim().length > 10,
        )
      : [];
  } catch {
    return;
  }
  if (!learnings.length) return;

  const items = learnings.slice(0, 3).map(content => ({
    agent_id:     agentId,
    portal_email: portalEmail,
    vapi_call_id: vapiCallId,
    content:      content.trim().slice(0, 500),
    status:       'pending',
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
