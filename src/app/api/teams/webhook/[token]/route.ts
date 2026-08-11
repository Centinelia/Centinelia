import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';
import { consumeAiOp, refundOps } from '@/lib/ai/ops-guard';

const anthropic = new Anthropic();

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase  = createAdminClient();

  // Look up agent — acepta org token o legacy voice_agents.portal_token.
  const agent = await getPrimaryAgentFromToken<{
    id: string; business_name: string; agent_name: string | null;
    knowledge_base: string | null; role_knowledge_base: string | null;
    role: string | null; teams_user_email: string | null;
  }>(token, 'id, business_name, agent_name, knowledge_base, role_knowledge_base, role, teams_user_email', supabase);

  if (!agent) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

  let body: {
    message:         string;
    sender_name?:    string;
    sender_email?:   string;
    conversation_id: string;
    chat_type?:      string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!body.message?.trim() || !body.conversation_id) {
    return NextResponse.json({ error: 'Faltan campos: message, conversation_id' }, { status: 400 });
  }

  // Skip messages sent by the agent user herself (avoids infinite loop)
  const ownEmail = (agent as any).teams_user_email as string | null;
  if (ownEmail && body.sender_email?.toLowerCase() === ownEmail.toLowerCase()) {
    return NextResponse.json({ skipped: true, reason: 'own message' });
  }

  // Fetch recent conversation history for context
  const { data: history } = await supabase
    .from('teams_messages')
    .select('sender_name, message, reply, created_at')
    .eq('agent_id', agent.id)
    .eq('conversation_id', body.conversation_id)
    .order('created_at', { ascending: false })
    .limit(8);

  const historyText = (history ?? [])
    .reverse()
    .map(h => [
      `[${h.sender_name ?? 'Contacto'}]: ${h.message}`,
      h.reply ? `[Tú]: ${h.reply}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n');

  // Build system prompt
  const agentName   = (agent.agent_name as string | null)?.trim() || 'Asistente';
  const bizName     = agent.business_name as string;
  const kb          = (agent.knowledge_base as string | null)?.trim() ?? '';
  const roleKb      = (agent.role_knowledge_base as string | null)?.trim() ?? '';
  const role        = (agent.role as string | null)?.trim() ?? '';

  const systemParts = [
    `Eres el asistente de ${agentName} en ${bizName}, respondiendo mensajes de Microsoft Teams en su nombre.`,
    kb     ? `\nCONTEXTO DEL NEGOCIO:\n${kb}`   : '',
    roleKb ? `\nROL ESPECIALIZADO${role ? ` — ${role.toUpperCase()}` : ''}:\n${roleKb}` : '',
    `\nREGLAS PARA RESPONDER EN TEAMS:
- Mensajes cortos y directos (Teams es chat, no email)
- Tono profesional pero natural y cercano
- Responde en el mismo idioma del mensaje recibido
- No uses saludos formales de email (Estimado, etc.)
- Si no sabes algo, di que lo verificas y responderás pronto
- No incluyas firmas ni pies de página`,
  ].filter(Boolean).join('');

  const userContent = [
    historyText ? `HISTORIAL RECIENTE DE LA CONVERSACIÓN:\n${historyText}\n` : '',
    `NUEVO MENSAJE A RESPONDER:`,
    `De: ${body.sender_name ?? 'Contacto'}${body.sender_email ? ` (${body.sender_email})` : ''}`,
    `Mensaje: ${body.message}`,
    `\nRedacta la respuesta directamente (solo el texto a enviar):`,
  ].filter(Boolean).join('\n');

  let reply = '';
  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  // Fix N6 audit: cobrar 1 op por respuesta Teams (antes silent).
  const teamsCharge = await consumeAiOp(agent.id, 1, { source: 'teams_reply', label: 'Respuesta Microsoft Teams' });
  try {
    const msg = await anthropic.messages.create({
      model:      __m,
      max_tokens: 600,
      system: [{ type: 'text', text: systemParts, cache_control: { type: 'ephemeral' } }],
      messages:   [{ role: 'user', content: userContent }],
    });
    void logLlmCall({ source: 'teams_webhook', model: __m, usage: msg.usage, agentId: agent.id, latencyMs: Date.now() - __t });
    reply = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  } catch (err) {
    void logLlmCall({ source: 'teams_webhook', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
    console.error('[teams-webhook] Claude error:', err);
    if (teamsCharge.ok) void refundOps(agent.id, 1, { label: 'Respuesta Teams (fallo LLM)' });
    return NextResponse.json({ error: 'Error generando respuesta' }, { status: 500 });
  }

  // Store the message + reply
  await supabase.from('teams_messages').insert({
    agent_id:        agent.id,
    conversation_id: body.conversation_id,
    sender_name:     body.sender_name ?? null,
    sender_email:    body.sender_email ?? null,
    chat_type:       body.chat_type ?? 'chat',
    message:         body.message,
    reply,
  });

  return NextResponse.json({ reply });
}
