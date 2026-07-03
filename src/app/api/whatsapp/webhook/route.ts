import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { buildWASystemPrompt } from '@/lib/whatsapp/prompt-builder';
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

export async function POST(req: NextRequest) {
  const text = await req.text();

  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!validateTwilioSignature(text, signature)) {
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

  // 1. Find the agent by wa_phone_number
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('wa_phone_number', agentWaNumber)
    .eq('active', true)
    .maybeSingle();

  if (!agentRow) {
    console.warn('wa/webhook: no active agent for number', agentWaNumber);
    return NextResponse.json({ ok: true });
  }

  const agent = agentRow as VoiceAgent;

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
  const tools: Anthropic.Tool[] = [];
  if (agent.capture_appointments) {
    tools.push(CITA_TOOL);
  }
  if (agent.capture_leads || agent.capture_orders) {
    tools.push(LEAD_TOOL);
  }

  const systemPrompt = buildWASystemPrompt(agent);

  let claudeReply = '';
  let capturedLead: WACapturedLead | null = null;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? { type: 'auto' } : undefined,
    });

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
          const followUp = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: systemPrompt,
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
          claudeReply = followUp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
        }
      } else if (block.type === 'tool_use' && block.name === 'guardar_lead') {
        capturedLead = block.input as WACapturedLead;

        // If Claude used a tool, get the follow-up text response
        if (!claudeReply) {
          const followUp = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: systemPrompt,
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
