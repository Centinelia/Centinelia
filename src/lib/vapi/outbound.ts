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
}: {
  agent:          VoiceAgent;
  customerNumber: string;
  customerName?:  string;
  motivo?:        string;
}): Promise<{ ok: boolean; callId?: string; error?: string }> {
  if (!agent.vapi_agent_id) {
    return { ok: false, error: 'El agente no está sincronizado con Vapi' };
  }

  const phoneNumberId = await resolveVapiPhoneNumberId(agent.id, agent.phone_number);
  if (!phoneNumberId) {
    return { ok: false, error: `No se encontró el número ${agent.phone_number} en Vapi` };
  }

  const greeting     = customerName ? `Hola ${customerName}` : 'Hola';
  const motivoPart   = motivo ? ` Le llamo porque ${motivo.toLowerCase()}.` : '';
  const firstMessage = `${greeting}, le habla ${agent.business_name}.${motivoPart} ¿Tiene un momento?`;

  const systemPrompt = buildOutboundSystemPrompt(agent, customerName, motivo);

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
