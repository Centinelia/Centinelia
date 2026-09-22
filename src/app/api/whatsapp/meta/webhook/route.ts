/**
 * Webhook Meta Cloud API para agents con provider='meta'.
 *
 *   GET  — verificacion de suscripcion (hub.challenge)
 *   POST — eventos autenticados (messages + statuses) con firma sha256
 *
 * Este endpoint es SEPARADO de /api/whatsapp/webhook (Twilio) para no mezclar
 * providers. Cada tabla `whatsapp_agents` decide su provider; el routing
 * empieza por `meta_phone_number_id` en este endpoint y por `wa_phone_number`
 * en el Twilio.
 */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withWebhookAuth } from '@/lib/webhooks/with-webhook-auth';
import { buildWASystemPrompt } from '@/lib/whatsapp/prompt-builder';
import { PRIMELIFT_ADDENDUM } from '@/lib/whatsapp/primelift-addendum';
import { sendMetaText } from '@/lib/whatsapp/meta-send';
import { checkAccount } from '@/lib/compliance/account-guard';
import { logLlmCall } from '@/lib/observability/llm-log';
import { consumeAiOp, refundOps } from '@/lib/ai/ops-guard';
import type { MetaWaEvent } from '@/lib/webhooks/providers';
import type { VoiceAgent } from '@/types/agent';
import type { WAMessage } from '@/types/whatsapp-agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Tool schemas (6 para PrimeLift) ────────────────────────────────────────

const CAPTURAR_LEAD_VENTA_TOOL: Anthropic.Tool = {
  name: 'capturar_lead_venta',
  description: 'Guarda los datos de un prospecto interesado en comprar o rentar. Uso: cuando el cliente muestra intencion clara y ya recopilaste nombre + contacto + tipo de necesidad.',
  input_schema: {
    type: 'object',
    properties: {
      nombre:      { type: 'string' },
      whatsapp:    { type: 'string', description: 'Numero E.164 sin +. Ej: 528112803360' },
      empresa:     { type: 'string' },
      tipo:        { type: 'string', description: 'venta | renta | ambos' },
      montacargas: { type: 'string', description: 'Modelo o descripcion (ej: electrico 2 ton, combustion 3 ton diesel)' },
      capacidad:   { type: 'string', description: 'Capacidad en kg si el cliente la especifico' },
      urgencia:    { type: 'string', description: 'inmediato | 1 mes | 3 meses | evaluando' },
      notas:       { type: 'string' },
    },
    required: ['nombre'],
  },
};

const AGENDAR_VISITA_COMERCIAL_TOOL: Anthropic.Tool = {
  name: 'agendar_visita_comercial',
  description: 'Agenda una visita comercial (cotizacion presencial en las instalaciones del prospecto). Uso: cliente calificado que quiere ver equipo o recibir asesoria en sitio.',
  input_schema: {
    type: 'object',
    properties: {
      nombre:    { type: 'string' },
      empresa:   { type: 'string' },
      fecha:     { type: 'string', description: 'Ej: martes 24 de septiembre 2026' },
      hora:      { type: 'string', description: 'Ej: 11:00' },
      direccion: { type: 'string', description: 'Direccion completa de la visita' },
      telefono:  { type: 'string' },
      notas:     { type: 'string' },
    },
    required: ['nombre', 'fecha', 'direccion'],
  },
};

const MANDAR_FICHA_MONTACARGAS_TOOL: Anthropic.Tool = {
  name: 'mandar_ficha_montacargas',
  description: 'Envia al cliente la ficha tecnica de un modelo (PDF o link). Uso: cliente pide detalles tecnicos o comparar entre modelos. Devuelve texto listo para pegar (incluye link real de la ficha del catalogo del negocio, NUNCA inventes uno).',
  input_schema: {
    type: 'object',
    properties: {
      modelo: { type: 'string', description: 'Modelo exacto o descripcion (ej: MC-2500 electrico, Toyota 8FD25U)' },
    },
    required: ['modelo'],
  },
};

const REGISTRAR_TICKET_FALLA_TOOL: Anthropic.Tool = {
  name: 'registrar_ticket_falla',
  description: 'Registra un ticket de falla para dispatch de mecanico. Uso: cliente reporta problema con equipo (rentado o propio con servicio). Prioridad alta = equipo detenido; normal = falla menor sin detener operacion.',
  input_schema: {
    type: 'object',
    properties: {
      cliente:       { type: 'string' },
      empresa:       { type: 'string' },
      equipo:        { type: 'string', description: 'Serie, modelo o descripcion del equipo con la falla' },
      sintoma:       { type: 'string', description: 'Que esta pasando: no enciende, fuga hidraulica, no eleva, ruido raro, etc.' },
      prioridad:     { type: 'string', description: 'alta | normal' },
      ubicacion:     { type: 'string', description: 'Donde esta el equipo (direccion o referencia)' },
      contacto_wa:   { type: 'string', description: 'WhatsApp del contacto en sitio' },
    },
    required: ['cliente', 'equipo', 'sintoma', 'prioridad'],
  },
};

const AGENDAR_SERVICIO_TECNICO_TOOL: Anthropic.Tool = {
  name: 'agendar_servicio_tecnico',
  description: 'Agenda una visita de servicio tecnico programado (mantenimiento preventivo). Uso: cliente quiere programar servicio, no es urgente. Si es falla activa usa registrar_ticket_falla en su lugar.',
  input_schema: {
    type: 'object',
    properties: {
      cliente:   { type: 'string' },
      empresa:   { type: 'string' },
      equipo:    { type: 'string' },
      fecha:     { type: 'string' },
      hora:      { type: 'string' },
      ubicacion: { type: 'string' },
      tipo:      { type: 'string', description: 'preventivo | correctivo programado' },
      notas:     { type: 'string' },
    },
    required: ['cliente', 'equipo', 'fecha', 'ubicacion'],
  },
};

const SOLICITAR_HANDOFF_TOOL: Anthropic.Tool = {
  name: 'solicitar_handoff',
  description: 'Transfiere la conversacion al humano de PrimeLift. Uso: SOLO cuando aplica uno de los 5 disparadores de handoff descritos en tu prompt. Despues de esta tool NO respondas mas en la conversacion.',
  input_schema: {
    type: 'object',
    properties: {
      motivo:  { type: 'string', description: 'Cual de los 5 disparadores aplico + detalle breve. Ej: "cliente escalado - pide reembolso por equipo defectuoso"' },
      cliente: { type: 'string', description: 'Nombre del cliente si lo capturaste' },
    },
    required: ['motivo'],
  },
};

const TOOLS: Anthropic.Tool[] = [
  CAPTURAR_LEAD_VENTA_TOOL,
  AGENDAR_VISITA_COMERCIAL_TOOL,
  MANDAR_FICHA_MONTACARGAS_TOOL,
  REGISTRAR_TICKET_FALLA_TOOL,
  AGENDAR_SERVICIO_TECNICO_TOOL,
  SOLICITAR_HANDOFF_TOOL,
];

// ─── GET: Meta subscription verification ────────────────────────────────────

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode      = params.get('hub.mode');
  const token     = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  const expected  = process.env.META_WA_VERIFY_TOKEN;

  if (mode === 'subscribe' && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('forbidden', { status: 403 });
}

// ─── POST: message handler ──────────────────────────────────────────────────

export const POST = withWebhookAuth('meta_wa', async (_req: NextRequest, { event, supabase }) => {
  const metaEvent = event as MetaWaEvent;
  const value = metaEvent.entry?.[0]?.changes?.[0]?.value;
  const msg   = value?.messages?.[0];
  if (!msg || msg.type !== 'text' || !msg.text?.body) {
    // Status update, no-text message, etc. Ack sin procesar.
    return NextResponse.json({ ok: true });
  }

  const metaPhoneNumberId = value?.metadata?.phone_number_id ?? '';
  const customerWaId      = msg.from ?? '';
  const customerNumber    = `+${customerWaId}`;
  const msgBody           = msg.text.body.trim();
  if (!metaPhoneNumberId || !customerWaId || !msgBody) {
    return NextResponse.json({ ok: true });
  }

  // 1. Resolve agent por meta_phone_number_id
  const { data: agentRow } = await supabase
    .from('whatsapp_agents')
    .select('*, voice_agents(*)')
    .eq('meta_phone_number_id', metaPhoneNumberId)
    .eq('provider', 'meta')
    .eq('active', true)
    .maybeSingle();

  if (!agentRow) {
    console.warn('wa/meta: no active agent for meta_phone_number_id', metaPhoneNumberId);
    return NextResponse.json({ ok: true });
  }
  const { voice_agents: voiceAgent, ...waFields } = agentRow;
  const agent = { ...(voiceAgent ?? {}), ...waFields } as VoiceAgent & { handoff_phone?: string };

  // 2. Account guard (suspended/terminated → ack sin responder)
  const portalEmail = (agent as unknown as { portal_email?: string }).portal_email;
  const guard = await checkAccount(portalEmail, supabase);
  if (!guard.canOperate) {
    return NextResponse.json({ ok: true });
  }

  // 3. Load conversation
  const { data: existingConv } = await supabase
    .from('wa_conversations')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('customer_number', customerNumber)
    .maybeSingle();

  const prevMessages: WAMessage[] = existingConv?.messages ?? [];
  const nowIso = new Date().toISOString();
  const userMsg: WAMessage = { role: 'user', content: msgBody, ts: nowIso };
  const allMessages: WAMessage[] = [...prevMessages, userMsg];

  // 4. Si la conversacion ya esta en handoff, no respondemos — solo persistimos
  //    el mensaje entrante para que el humano lo vea en el historial cuando entre.
  if (existingConv?.status === 'handed_off') {
    await supabase.from('wa_conversations').upsert({
      agent_id:        agent.id,
      customer_number: customerNumber,
      messages:        allMessages,
      status:          'handed_off',
      updated_at:      nowIso,
    }, { onConflict: 'agent_id,customer_number' });
    return NextResponse.json({ ok: true, skipped: 'handed_off' });
  }

  // 5. Pool guard — consume 1 mensaje del pool antes de llamar LLM
  const opConsumed = await consumeAiOp(agent.id, 1, { source: 'wa_meta_message', label: 'WhatsApp Meta' });
  if (!opConsumed.ok) {
    console.warn('wa/meta: pool exhausted, skipping', { agentId: agent.id, used: opConsumed.used, limit: opConsumed.limit });
    return NextResponse.json({ ok: true, skipped: 'pool_exhausted' });
  }

  // 6. Build system prompt (base + addendum PrimeLift)
  const systemPrompt = buildWASystemPrompt(agent) + '\n\n' + PRIMELIFT_ADDENDUM;

  const claudeMessages: Anthropic.MessageParam[] = allMessages
    .slice(-30)
    .map(m => ({ role: m.role, content: m.content }));

  // 7. LLM call con tools
  let responseText = '';
  const toolCalls: Anthropic.ToolUseBlock[] = [];
  try {
    const resp = await anthropic.messages.create({
      model:       'claude-haiku-4-5-20251001',
      max_tokens:  600,
      system:      systemPrompt,
      tools:       TOOLS,
      messages:    claudeMessages,
      temperature: 0.4,
    });
    await logLlmCall({
      source:  'wa_meta_webhook',
      model:   'claude-haiku-4-5-20251001',
      usage:   resp.usage,
      agentId: agent.id,
    });
    for (const block of resp.content) {
      if (block.type === 'text')     responseText += block.text;
      if (block.type === 'tool_use') toolCalls.push(block);
    }
  } catch (e) {
    await refundOps(agent.id, 1, { source: 'wa_meta_message' }).catch(() => {});
    console.error('wa/meta: LLM error', e);
    return NextResponse.json({ ok: true, skipped: 'llm_error' });
  }

  // 8. Ejecutar tool calls basicos + detectar handoff
  let handoffDispatched = false;
  let handoffMotivo     = '';
  for (const tc of toolCalls) {
    if (tc.name === 'solicitar_handoff') {
      handoffDispatched = true;
      handoffMotivo     = ((tc.input as Record<string, unknown>).motivo as string) ?? 'sin motivo declarado';
      continue;
    }
    // Persistir tool call en wa_tool_calls (tabla generica de audit).
    // Envuelto en try para tolerar que la tabla no exista aun (Fase A).
    try {
      await supabase.from('wa_tool_calls').insert({
        agent_id:        agent.id,
        customer_number: customerNumber,
        tool_name:       tc.name,
        tool_input:      tc.input,
        handled_by:      'inline_v1',
        created_at:      nowIso,
      });
    } catch { /* tabla podria no existir en fase A; ignorar */ }
  }

  // 9. Handoff dispatch (Modo 1: transferencia dura al numero fijo del cliente)
  const handoffPhone = agent.handoff_phone;
  if (handoffDispatched && handoffPhone && metaPhoneNumberId) {
    const notifyBody = `[Handoff PrimeLift] Cliente ${customerNumber} necesita ayuda.\nMotivo: ${handoffMotivo}\nUltimo mensaje: ${msgBody.slice(0, 200)}`;
    await sendMetaText({
      phoneNumberId: metaPhoneNumberId,
      to:            handoffPhone,
      body:          notifyBody,
    }).catch(err => console.error('wa/meta: handoff notify failed', err));
    // Respuesta al cliente: transferencia dura
    responseText = `Ya avise al equipo, en unos minutos te contactan al numero que usas. Cierro aqui.`;
  } else if (!responseText.trim()) {
    responseText = 'Un momento, ya reviso.';
  }

  // 10. Send response al cliente
  const sendResult = await sendMetaText({
    phoneNumberId: metaPhoneNumberId,
    to:            customerNumber,
    body:          responseText,
  });
  if (!sendResult.ok) {
    console.error('wa/meta: send failed', sendResult.error);
  }

  // 11. Persist conversacion
  const assistantMsg: WAMessage = { role: 'assistant', content: responseText, ts: new Date().toISOString() };
  await supabase.from('wa_conversations').upsert({
    agent_id:        agent.id,
    customer_number: customerNumber,
    messages:        [...allMessages, assistantMsg],
    status:          handoffDispatched ? 'handed_off' : 'active',
    updated_at:      new Date().toISOString(),
  }, { onConflict: 'agent_id,customer_number' });

  return NextResponse.json({ ok: true, handoff: handoffDispatched });
});
