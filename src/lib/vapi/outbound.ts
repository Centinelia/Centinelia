import { createAdminClient } from '@/lib/supabase/admin';
import { buildOutboundSystemPrompt } from '@/lib/voice/outbound-prompt-builder';
import type { VoiceAgent } from '@/types/agent';

const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY!;

function headers() {
  return { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' };
}

async function resolveVapiPhoneNumberId(agentId: string, phoneNumber: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('voice_agents')
    .select('vapi_phone_number_id')
    .eq('id', agentId)
    .single();

  if (data?.vapi_phone_number_id) return data.vapi_phone_number_id;

  const res = await fetch(`${VAPI_URL}/phone-number`, { headers: headers() });
  if (!res.ok) return null;

  const phones: Array<{ id: string; number: string }> = await res.json();
  const phone = phones.find(p => p.number === phoneNumber);
  if (!phone) return null;

  await supabase
    .from('voice_agents')
    .update({ vapi_phone_number_id: phone.id })
    .eq('id', agentId);

  return phone.id;
}

export async function triggerOutboundCall({
  agent,
  customerNumber,
  customerName,
  motivo,
  isCallback = false,
}: {
  agent:          VoiceAgent;
  customerNumber: string;
  customerName?:  string;
  motivo?:        string;
  isCallback?:    boolean;
}): Promise<{ ok: boolean; callId?: string; error?: string }> {
  if (!agent.vapi_agent_id) {
    return { ok: false, error: 'El agente no está sincronizado con Vapi' };
  }

  const phoneNumberId = await resolveVapiPhoneNumberId(agent.id, agent.phone_number);
  if (!phoneNumberId) {
    return { ok: false, error: `No se encontró el número ${agent.phone_number} en Vapi` };
  }

  // Proactive memory lookup for agents with client_memory or existing_client_support
  let resolvedName    = customerName;
  let customerContext = '';

  if (agent.features?.client_memory || agent.features?.existing_client_support) {
    const supabase  = createAdminClient();
    const normPhone = customerNumber.replace(/\D/g, '').slice(-10);

    const [leadRes, histRes] = await Promise.all([
      supabase
        .from('leads_voice')
        .select('nombre')
        .eq('agent_id', agent.id)
        .ilike('whatsapp', `%${normPhone}%`)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('voice_calls')
        .select('summary, outcome, created_at')
        .eq('agent_id', agent.id)
        .ilike('caller_number', `%${normPhone}%`)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const lead    = leadRes.data;
    const history = histRes.data ?? [];

    if (lead?.nombre || history.length > 0) {
      resolvedName = resolvedName || lead?.nombre || '';
      const parts: string[] = [];
      if (resolvedName) parts.push(`Nombre: ${resolvedName}`);
      if (history.length > 0) {
        parts.push(`Ha llamado antes ${history.length} vez${history.length > 1 ? 'es' : ''}.`);
        if (history[0]?.summary) parts.push(`Última llamada: ${history[0].summary}`);
      }
      customerContext = `CONTEXTO DEL CLIENTE (${customerNumber}):\n${parts.join('\n')}`;
    }
  }

  const isFormal  = (agent.speech_style ?? 'usted') !== 'tu';
  const notice    = 'Esta llamada puede ser grabada.';
  const firstName = resolvedName ? ` ${resolvedName.split(' ')[0]}` : '';
  const greeting  = resolvedName ? `Hola${firstName}` : 'Hola';

  const firstMessage = isCallback
    ? `Hola${firstName}, ${isFormal ? 'le' : 'te'} hablamos de ${agent.business_name}. ${notice} Nos llamaste hace un momento y no pudimos contestar, ${isFormal ? 'le ofrecemos una disculpa' : 'te pedimos una disculpa'}, pero ${isFormal ? 'díganos' : 'dinos'}, ¿en qué ${isFormal ? 'le' : 'te'} podemos servir?`
    : `${greeting}, le habla ${agent.business_name}. ${notice}${motivo ? ` Le llamo porque ${motivo.toLowerCase()}.` : ''} ¿Tiene un momento?`;

  const systemPrompt = buildOutboundSystemPrompt(agent, resolvedName, motivo, customerContext);

  const res = await fetch(`${VAPI_URL}/call`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      assistantId:  agent.vapi_agent_id,
      phoneNumberId,
      customer: {
        number: customerNumber,
        ...(customerName ? { name: customerName } : {}),
      },
      assistantOverrides: {
        firstMessage,
        model: {
          messages: [{ role: 'system', content: systemPrompt }],
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Vapi outbound call error:', err);
    return { ok: false, error: err };
  }

  const data = await res.json();
  return { ok: true, callId: data.id as string };
}
