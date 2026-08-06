import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { buildWASystemPrompt } from '@/lib/whatsapp/prompt-builder';
import { checkAccount } from '@/lib/compliance/account-guard';
import { logLlmCall } from '@/lib/observability/llm-log';
import type { WAMessage, WACapturedLead } from '@/types/whatsapp-agent';
import type { VoiceAgent } from '@/types/agent';

export const dynamic = 'force-dynamic';

function validateTwilioSignature(rawBody: string, signature: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!authToken || !signature || !appUrl) return false;

  const url = `${appUrl}/api/whatsapp/webhook`;
  const params = new URLSearchParams(rawBody);
  const sorted = [...params.keys()].sort();
  const paramStr = sorted.map(k => `${k}${params.get(k)}`).join('');

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(url + paramStr)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CITA_TOOL: Anthropic.Tool = {
  name: 'agendar_cita',
  description: 'Agenda una cita para el cliente. Úsala cuando hayas recopilado nombre, servicio o motivo, fecha y hora preferida.',
  input_schema: {
    type: 'object',
    properties: {
      nombre:   { type: 'string', description: 'Nombre completo del cliente' },
      servicio: { type: 'string', description: 'Servicio o motivo de la cita' },
      fecha:    { type: 'string', description: 'Fecha de la cita (ej: martes 15 de julio de 2026)' },
      hora:     { type: 'string', description: 'Hora de la cita (ej: 10:00)' },
      telefono: { type: 'string', description: 'Teléfono de confirmación' },
      notas:    { type: 'string', description: 'Notas adicionales' },
    },
    required: ['nombre', 'fecha'],
  },
};

const LEAD_TOOL: Anthropic.Tool = {
  name: 'guardar_lead',
  description: 'Guarda los datos de contacto del prospecto o cliente interesado. Úsala cuando hayas recopilado al menos nombre y un medio de contacto.',
  input_schema: {
    type: 'object',
    properties: {
      nombre:      { type: 'string', description: 'Nombre completo del cliente' },
      whatsapp:    { type: 'string', description: 'Número de WhatsApp o teléfono' },
      email:       { type: 'string', description: 'Correo electrónico' },
      negocio:     { type: 'string', description: 'Nombre del negocio (si aplica)' },
      giro:        { type: 'string', description: 'Giro o industria del negocio' },
      servicio:    { type: 'string', description: 'Servicio, producto o motivo de interés' },
      presupuesto: { type: 'string', description: 'Presupuesto aproximado' },
      timeline:    { type: 'string', description: 'Para cuándo lo necesita' },
      notas:       { type: 'string', description: 'Cualquier nota adicional relevante' },
    },
    required: ['nombre'],
  },
};

const DELEGAR_TAREA_TOOL: Anthropic.Tool = {
  name: 'delegar_tarea',
  description: 'Delega una tarea a un compañero del equipo digital para que la ejecute. El compañero trabaja en la tarea usando sus herramientas y reporta el resultado.',
  input_schema: {
    type: 'object',
    properties: {
      agente:           { type: 'string', description: 'Nombre o rol del compañero. Ej: "Nox", "Nova", "contabilidad".' },
      tarea:            { type: 'string', description: 'Descripción clara de lo que debe hacer el compañero.' },
      contexto:         { type: 'string', description: 'Contexto del chat que ayude al compañero a entender la solicitud. Opcional.' },
      success_criteria: { type: 'string', description: 'Qué debe haber pasado para considerar la tarea completada. Si se define, el agente reintentará si no lo cumple.' },
      max_iterations:   { type: 'number', description: 'Intentos máximos para cumplir el criterio (1-5, default 3).' },
    },
    required: ['agente', 'tarea'],
  },
};

const CONSULTAR_AGENTE_TOOL: Anthropic.Tool = {
  name: 'consultar_agente',
  description: 'Consulta a un compañero del equipo digital cuando no tienes la información y esa es su área. El compañero puede buscar en su Drive e internet antes de responder.',
  input_schema: {
    type: 'object',
    properties: {
      rol:      { type: 'string', description: 'Nombre o rol del compañero. Ej: "Nova", "contador", "almacén".' },
      tarea:    { type: 'string', description: 'Qué necesitas que el compañero te responda o resuelva.' },
      contexto: { type: 'string', description: 'Contexto del chat que ayude al compañero a responder mejor. Opcional.' },
    },
    required: ['rol', 'tarea'],
  },
};

const BUSCAR_ARCHIVO_TOOL: Anthropic.Tool = {
  name: 'buscar_archivo',
  description: 'Busca un archivo en el Drive del negocio por nombre o descripción. Devuelve nombre e ID del archivo para poder leerlo con leer_archivo.',
  input_schema: {
    type: 'object',
    properties: {
      busqueda: { type: 'string', description: 'Nombre o descripción del archivo a buscar.' },
    },
    required: ['busqueda'],
  },
};

const LEER_ARCHIVO_TOOL: Anthropic.Tool = {
  name: 'leer_archivo',
  description: 'Lee el contenido de un archivo encontrado con buscar_archivo. Úsala para conocer el contenido de un documento y responder preguntas sobre él.',
  input_schema: {
    type: 'object',
    properties: {
      file_id:   { type: 'string', description: 'ID del archivo obtenido de buscar_archivo.' },
      file_name: { type: 'string', description: 'Nombre del archivo con extensión.' },
      mime_type: { type: 'string', description: 'Tipo MIME del archivo. Ej: application/pdf.' },
    },
    required: ['file_id', 'file_name'],
  },
};

const BUSCAR_EN_WEB_TOOL: Anthropic.Tool = {
  name: 'buscar_en_web',
  description: 'Busca información en internet cuando no está en tu base de conocimiento ni en el Drive del negocio.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Términos de búsqueda.' },
    },
    required: ['query'],
  },
};

const PEDIR_A_HUMANO_TOOL: Anthropic.Tool = {
  name: 'pedir_a_humano',
  description: `Pide a un humano del equipo del negocio: info que no tienes, una acción física, o confirmación de una decisión importante.

Úsala CUANDO:
- Necesitas datos/archivos que no están en Drive ni puedes obtener con otras tools
- Requiere una acción FÍSICA que solo un humano puede hacer (revisar stock, firmar documento en papel)
- Requiere aprobación de una decisión que excede tu autoridad

Para llamadas telefónicas:
- Si tienes minutos disponibles Y toda la info → usa trigger_outbound_call, NO pidas a humano
- Solo pide llamada a humano si: sin minutos, cliente pidió humano, o conversación delicada

NO la uses para:
- Info obtenible con search_files, buscar_en_web, o QB
- Cosas que puede hacer otro agente (usa delegate_task)
- Llamadas que puedes hacer tú (usa trigger_outbound_call primero)`,
  input_schema: {
    type: 'object',
    properties: {
      type:         { type: 'string', enum: ['info', 'action', 'approval'] },
      target:       { type: 'string', enum: ['approver', 'owner', 'specific'] },
      target_email: { type: 'string' },
      title:        { type: 'string' },
      description:  { type: 'string' },
      urgency:      { type: 'string', enum: ['baja', 'media', 'alta'] },
      needed_by:    { type: 'string' },
    },
    required: ['type', 'target', 'title', 'description'],
  },
};

async function callVoiceRoute(
  routeName: string,
  agentId:   string,
  input:     Record<string, unknown>,
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  try {
    const res = await fetch(`${appUrl}/api/voice/tools/${routeName}?agent_id=${agentId}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VAPI_SERVER_SECRET ? { 'x-vapi-secret': process.env.VAPI_SERVER_SECRET } : {}),
      },
      body:    JSON.stringify(input),
    });
    if (!res.ok) return 'No pude completar la acción en este momento.';
    const data = await res.json() as { result?: string; results?: Array<{ result: string }> };
    return data.result ?? data.results?.[0]?.result ?? 'Acción completada.';
  } catch {
    return 'Error al ejecutar la acción.';
  }
}

const WA_ROUTE_MAP: Record<string, string> = {
  consultar_agente: 'consultar-agente',
  buscar_archivo:   'buscar-archivo',
  leer_archivo:     'leer-archivo',
  buscar_en_web:    'buscar-en-web',
  pedir_a_humano:   'exec/pedir_a_humano',
};

export async function POST(req: NextRequest) {
  const text = await req.text();

  const isDev = process.env.NODE_ENV !== 'production';
  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!isDev && !validateTwilioSignature(text, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const params = new URLSearchParams(text);

  const fromRaw  = params.get('From') ?? '';  // 'whatsapp:+521234567890'
  const toRaw    = params.get('To')   ?? '';  // 'whatsapp:+14155238886'
  const msgBody  = (params.get('Body') ?? '').trim();

  if (!fromRaw || !toRaw || !msgBody) {
    return NextResponse.json({ ok: true });
  }

  const customerNumber = fromRaw.replace('whatsapp:', '');
  const agentWaNumber  = toRaw.replace('whatsapp:', '');

  const supabase = createAdminClient();

  // 1. Find the WhatsApp agent by wa_phone_number, joining voice_agents for full feature set
  const { data: agentRow } = await supabase
    .from('whatsapp_agents')
    .select('*, voice_agents(*)')
    .eq('wa_phone_number', agentWaNumber)
    .eq('active', true)
    .maybeSingle();

  if (!agentRow) {
    console.warn('wa/webhook: no active agent for number', agentWaNumber);
    return NextResponse.json({ ok: true });
  }

  // Merge voice_agents fields (full config) with whatsapp_agents overrides
  const { voice_agents: voiceAgent, ...waFields } = agentRow;
  const agent = { ...(voiceAgent ?? {}), ...waFields } as VoiceAgent;

  // Account guard: suspended = silently drop; terminated = drop
  const portalEmail = (agent as any).portal_email as string | undefined;
  const guard = await checkAccount(portalEmail, supabase);
  if (!guard.canOperate) {
    return NextResponse.json({ ok: true });
  }

  // 2. Find or create conversation
  const { data: existingConv } = await supabase
    .from('wa_conversations')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('customer_number', customerNumber)
    .maybeSingle();

  const prevMessages: WAMessage[] = existingConv?.messages ?? [];
  const newUserMsg: WAMessage = { role: 'user', content: msgBody, ts: new Date().toISOString() };
  const allMessages = [...prevMessages, newUserMsg];

  // 3. Build Claude message history (last 30 messages for context)
  const claudeMessages: Anthropic.MessageParam[] = allMessages
    .slice(-30)
    .map(m => ({ role: m.role, content: m.content }));

  // 4. Call Claude with optional tool use
  const tools: Anthropic.Tool[] = [
    DELEGAR_TAREA_TOOL,
    CONSULTAR_AGENTE_TOOL,
    BUSCAR_ARCHIVO_TOOL,
    LEER_ARCHIVO_TOOL,
    BUSCAR_EN_WEB_TOOL,
    PEDIR_A_HUMANO_TOOL,
  ];
  if (agent.capture_appointments) {
    tools.push(CITA_TOOL);
  }
  if (agent.capture_leads || agent.capture_orders) {
    tools.push(LEAD_TOOL);
  }

  // Brand voice guide (per-org). Se inyecta en el prompt para que el bot
  // hable como este negocio, no con tono genérico.
  let brandVoiceGuide: string | null = null;
  if (agent.portal_email) {
    const { data: org } = await supabase
      .from('organizations')
      .select('brand_voice_guide')
      .eq('portal_email', agent.portal_email)
      .maybeSingle();
    brandVoiceGuide = (org?.brand_voice_guide as string | null) ?? null;
  }
  const systemPrompt = buildWASystemPrompt(agent, brandVoiceGuide);

  let claudeReply = '';
  let capturedLead: WACapturedLead | null = null;

  try {
    const __waT = Date.now();
    const __waM = 'claude-haiku-4-5-20251001';
    let response;
    try {
      response = await anthropic.messages.create({
        model: __waM,
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: claudeMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? { type: 'auto' } : undefined,
      });
      void logLlmCall({ source: 'whatsapp_webhook', model: __waM, usage: response.usage, agentId: agent.id as string, portalEmail: agent.portal_email, latencyMs: Date.now() - __waT });
    } catch (err) {
      void logLlmCall({ source: 'whatsapp_webhook', model: __waM, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id as string, portalEmail: agent.portal_email, latencyMs: Date.now() - __waT, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    // Extract text reply and handle tool use
    for (const block of response.content) {
      if (block.type === 'text') {
        claudeReply += block.text;
      } else if (block.type === 'tool_use' && block.name === 'agendar_cita') {
        const args = block.input as {
          nombre?: string; servicio?: string; fecha?: string;
          hora?: string; telefono?: string; notas?: string;
        };

        await supabase.from('wa_appointments').insert({
          agent_id:        agent.id,
          customer_number: customerNumber,
          nombre:          args.nombre ?? null,
          servicio:        args.servicio ?? null,
          fecha:           args.fecha ?? null,
          hora:            args.hora ?? null,
          notas:           args.notas ?? null,
          status:          'confirmada',
        }).then(({ error }) => {
          if (error) console.error('wa/webhook: appointment insert error', error.message);
        });

        if (!claudeReply) {
          const __fuT = Date.now();
          const followUp = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [
              ...claudeMessages,
              { role: 'assistant', content: response.content },
              {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: block.id, content: 'Cita registrada correctamente.' }],
              },
            ],
            tools,
          });
          void logLlmCall({ source: 'whatsapp_webhook_followup', model: 'claude-haiku-4-5-20251001', usage: followUp.usage, agentId: agent.id as string, portalEmail: agent.portal_email, latencyMs: Date.now() - __fuT, meta: { tool: 'agendar_cita' } });
          claudeReply = followUp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
        }
      } else if (block.type === 'tool_use' && block.name === 'guardar_lead') {
        capturedLead = block.input as WACapturedLead;

        // If Claude used a tool, get the follow-up text response
        if (!claudeReply) {
          const __fuT2 = Date.now();
          const followUp = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [
              ...claudeMessages,
              { role: 'assistant', content: response.content },
              {
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: 'Lead guardado exitosamente.',
                }],
              },
            ],
          });
          void logLlmCall({ source: 'whatsapp_webhook_followup', model: 'claude-haiku-4-5-20251001', usage: followUp.usage, agentId: agent.id as string, portalEmail: agent.portal_email, latencyMs: Date.now() - __fuT2, meta: { tool: 'guardar_lead' } });
          claudeReply = followUp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
        }
      } else if (block.type === 'tool_use' && block.name === 'delegar_tarea') {
        const dtInput  = block.input as { agente: string; tarea: string; contexto?: string };
        const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
        let   dtResult = 'Tarea procesada.';

        try {
          const dtRes = await fetch(
            `${appUrl}/api/voice/tools/delegar-tarea?agent_id=${agent.id}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(dtInput),
            },
          );
          if (dtRes.ok) {
            const dtData = await dtRes.json() as { results?: Array<{ result: string }> };
            dtResult = dtData.results?.[0]?.result ?? dtResult;
          }
        } catch (e) {
          console.error('wa/webhook: delegar_tarea error', e);
        }

        if (!claudeReply) {
          const __fuT3 = Date.now();
          const followUp = await anthropic.messages.create({
            model:   'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [
              ...claudeMessages,
              { role: 'assistant', content: response.content },
              {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: block.id, content: dtResult }],
              },
            ],
            tools,
          });
          void logLlmCall({ source: 'whatsapp_webhook_followup', model: 'claude-haiku-4-5-20251001', usage: followUp.usage, agentId: agent.id as string, portalEmail: agent.portal_email, latencyMs: Date.now() - __fuT3, meta: { tool: 'delegar_tarea' } });
          claudeReply = followUp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
        }
      } else if (block.type === 'tool_use' && block.name in WA_ROUTE_MAP) {
        const waResult = await callVoiceRoute(
          WA_ROUTE_MAP[block.name],
          agent.id as string,
          block.input as Record<string, unknown>,
        );

        if (!claudeReply) {
          const __fuT4 = Date.now();
          const followUp = await anthropic.messages.create({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [
              ...claudeMessages,
              { role: 'assistant', content: response.content },
              { role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: waResult }] },
            ],
            tools,
          });
          void logLlmCall({ source: 'whatsapp_webhook_followup', model: 'claude-haiku-4-5-20251001', usage: followUp.usage, agentId: agent.id as string, portalEmail: agent.portal_email, latencyMs: Date.now() - __fuT4, meta: { tool: block.name } });
          claudeReply = followUp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
        }
      }
    }
  } catch (err) {
    console.error('wa/webhook: Claude error', err);
    claudeReply = 'Lo siento, hubo un problema procesando tu mensaje. Por favor intenta nuevamente.';
  }

  if (!claudeReply) {
    claudeReply = 'Gracias por tu mensaje. ¿En qué más puedo ayudarte?';
  }

  // 5. Save captured lead to DB
  if (capturedLead) {
    await supabase.from('wa_leads').insert({
      agent_id:    agent.id,
      customer_number: customerNumber,
      ...capturedLead,
    }).then(({ error }) => {
      if (error) console.error('wa/webhook: lead insert error', error.message);
    });

    // Notify business owner via WhatsApp
    if (agent.transfer_whatsapp) {
      const leadSummary = [
        `🤖 *Nuevo lead capturado por WhatsApp*`,
        `👤 *Nombre:* ${capturedLead.nombre ?? 'N/D'}`,
        capturedLead.whatsapp   ? `📱 *WhatsApp:* ${capturedLead.whatsapp}` : '',
        capturedLead.email      ? `📧 *Email:* ${capturedLead.email}` : '',
        capturedLead.servicio   ? `🎯 *Interés:* ${capturedLead.servicio}` : '',
        capturedLead.presupuesto ? `💰 *Presupuesto:* ${capturedLead.presupuesto}` : '',
        capturedLead.timeline   ? `📅 *Timeline:* ${capturedLead.timeline}` : '',
        capturedLead.negocio    ? `🏢 *Negocio:* ${capturedLead.negocio}` : '',
        capturedLead.notas      ? `📝 *Notas:* ${capturedLead.notas}` : '',
      ].filter(Boolean).join('\n');

      await sendWhatsApp(agent.transfer_whatsapp, leadSummary);
    }
  }

  // 6. Append assistant reply to message history
  const assistantMsg: WAMessage = { role: 'assistant', content: claudeReply, ts: new Date().toISOString() };
  const updatedMessages = [...allMessages, assistantMsg];

  // 7. Upsert conversation
  if (existingConv) {
    await supabase
      .from('wa_conversations')
      .update({
        messages:      updatedMessages,
        lead_captured: existingConv.lead_captured || !!capturedLead,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', existingConv.id);
  } else {
    await supabase.from('wa_conversations').insert({
      agent_id:        agent.id,
      customer_number: customerNumber,
      messages:        updatedMessages,
      lead_captured:   !!capturedLead,
    });
  }

  // 8. Send reply to customer + track usage
  await sendWhatsApp(customerNumber, claudeReply, agentWaNumber);

  await supabase.rpc('increment_wa_messages_used', { p_agent_id: agent.id, p_count: 1 });

  return NextResponse.json({ ok: true });
}
