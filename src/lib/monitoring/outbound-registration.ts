// Drift detector: outbound calls de Vapi que NO se registraron en
// `outbound_calls` (o peor: se registraron en `voice_calls` como si fueran
// inbound). Es la firma exacta del bug audit 2026-09-29 Nelia Tortillería.
//
// Vapi es fuente de verdad para direction. Cada `call.type === 'outboundPhoneCall'`
// en Vapi debe tener match `vapi_call_id` en `outbound_calls`. Si aparece en
// `voice_calls` en lugar → smoking gun: el fix del serverUrl se rompió.

import type { SupabaseClient } from '@supabase/supabase-js';

export const OUTBOUND_REG_WINDOW_HOURS = 24;

export interface OutboundRegistrationResult {
  vapiOutboundInWindow: number;
  registeredCorrectly:  number;
  missing:              number;
  misregisteredInVoice: number;   // el smoking gun del bug 2026-09-29
  sample:               Array<{ vapi_call_id: string; created_at: string; customer_number: string; location: 'nowhere' | 'voice_calls' }>;
  level:                'ok' | 'warn' | 'critical';
}

interface VapiCall {
  id:         string;
  type?:      string;
  createdAt?: string;
  customer?:  { number?: string };
}

async function fetchVapiOutboundCalls(vapiApiKey: string, assistantId: string | null, sinceMs: number): Promise<VapiCall[]> {
  // Vapi list endpoint: hasta 100 sin paginación explícita. Si assistantId dado
  // se filtra; si no, jala global.
  const params = new URLSearchParams({ limit: '100' });
  if (assistantId) params.set('assistantId', assistantId);
  const res = await fetch(`https://api.vapi.ai/call?${params.toString()}`, {
    headers: { Authorization: `Bearer ${vapiApiKey}` },
  });
  if (!res.ok) return [];
  const raw = await res.json() as VapiCall[];
  return raw
    .filter(c => c.type === 'outboundPhoneCall')
    .filter(c => !c.createdAt || new Date(c.createdAt).getTime() >= sinceMs);
}

export async function detectOutboundRegistrationDrift(
  supabase: SupabaseClient,
  vapiApiKey: string,
  nowMs: number = Date.now(),
): Promise<OutboundRegistrationResult> {
  const sinceMs = nowMs - OUTBOUND_REG_WINDOW_HOURS * 3600_000;

  if (!vapiApiKey) {
    return { vapiOutboundInWindow: 0, registeredCorrectly: 0, missing: 0, misregisteredInVoice: 0, sample: [], level: 'ok' };
  }

  // 1. Traer todos los outbound de Vapi por assistant activo. Sin assistantId
  //    global también sirve pero suele ser muy ruidoso; iteramos por agente.
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('vapi_agent_id')
    .eq('active', true)
    .not('vapi_agent_id', 'is', null);

  const allOutbound: VapiCall[] = [];
  for (const a of ((agents ?? []) as Array<{ vapi_agent_id: string }>)) {
    const calls = await fetchVapiOutboundCalls(vapiApiKey, a.vapi_agent_id, sinceMs);
    allOutbound.push(...calls);
  }

  if (allOutbound.length === 0) {
    return { vapiOutboundInWindow: 0, registeredCorrectly: 0, missing: 0, misregisteredInVoice: 0, sample: [], level: 'ok' };
  }

  const ids = allOutbound.map(c => c.id);

  // 2. Match contra outbound_calls (el lugar correcto)
  const { data: inOutbound } = await supabase
    .from('outbound_calls')
    .select('vapi_call_id')
    .in('vapi_call_id', ids);
  const registeredSet = new Set(((inOutbound ?? []) as Array<{ vapi_call_id: string | null }>)
    .map(r => r.vapi_call_id)
    .filter((id): id is string => id != null));

  // 3. Match contra voice_calls (el lugar equivocado — smoking gun del bug)
  const { data: inVoice } = await supabase
    .from('voice_calls')
    .select('vapi_call_id, created_at')
    .in('vapi_call_id', ids);
  const inVoiceMap = new Map(((inVoice ?? []) as Array<{ vapi_call_id: string | null; created_at: string }>)
    .filter(r => r.vapi_call_id != null)
    .map(r => [r.vapi_call_id as string, r.created_at]));

  const missing:              VapiCall[] = [];
  const misregisteredInVoice: VapiCall[] = [];

  for (const c of allOutbound) {
    if (registeredSet.has(c.id)) continue;
    if (inVoiceMap.has(c.id)) {
      misregisteredInVoice.push(c);
    } else {
      missing.push(c);
    }
  }

  const sample = [
    ...misregisteredInVoice.slice(0, 5).map(c => ({
      vapi_call_id:    c.id,
      created_at:      c.createdAt ?? '',
      customer_number: c.customer?.number ?? '',
      location:        'voice_calls' as const,
    })),
    ...missing.slice(0, 5).map(c => ({
      vapi_call_id:    c.id,
      created_at:      c.createdAt ?? '',
      customer_number: c.customer?.number ?? '',
      location:        'nowhere' as const,
    })),
  ];

  const level: 'ok' | 'warn' | 'critical' =
    misregisteredInVoice.length > 0 ? 'critical'
    : missing.length > 0            ? 'warn'
    : 'ok';

  return {
    vapiOutboundInWindow: allOutbound.length,
    registeredCorrectly:  allOutbound.length - missing.length - misregisteredInVoice.length,
    missing:              missing.length,
    misregisteredInVoice: misregisteredInVoice.length,
    sample,
    level,
  };
}
