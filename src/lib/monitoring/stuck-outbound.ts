// Drift detector: outbound_contacts en status='calling' por más de N horas
// sin outbound_calls row correspondiente. Es la firma del bug audit
// 2026-09-29 Nelia Tortillería: atomic claim movió contact a 'calling',
// triggerOutboundCall pegó a Vapi, insert a outbound_calls falló silent
// (scheduled_at NOT NULL), contact stuck para siempre.
//
// Si esto vuelve a pasar en cualquier meerkat, el detector lo alerta antes
// de que se acumulen 40 contacts huérfanos como pasó con Nelia.

import type { SupabaseClient } from '@supabase/supabase-js';

export const STUCK_OUTBOUND_HOURS_WARN     = 2;   // aviso: probable bug
export const STUCK_OUTBOUND_HOURS_CRITICAL = 12;  // crítico: definitivamente algo mal

export interface StuckOutboundResult {
  totalStuck:    number;
  criticalStuck: number;
  byAgent:       Array<{ agent_id: string; agent_name: string | null; count: number; oldest_hours: number }>;
  level:         'ok' | 'warn' | 'critical';
}

interface StuckContactRow {
  id:         string;
  agent_id:   string;
  status:     string;
  updated_at: string | null;
  created_at: string;
}

interface OutboundCallRow { contact_id: string | null }

export async function detectStuckOutbound(
  supabase: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<StuckOutboundResult> {
  const warnCutoff = new Date(nowMs - STUCK_OUTBOUND_HOURS_WARN * 3600_000).toISOString();

  // 1. Contacts en 'calling' desde hace más de N horas
  const { data: stuckRaw } = await supabase
    .from('outbound_contacts')
    .select('id, agent_id, status, updated_at, created_at')
    .eq('status', 'calling')
    .lt('updated_at', warnCutoff);
  const stuck = (stuckRaw ?? []) as StuckContactRow[];

  if (stuck.length === 0) {
    return { totalStuck: 0, criticalStuck: 0, byAgent: [], level: 'ok' };
  }

  // 2. Match contra outbound_calls: si el contact tiene call → NO stuck
  const contactIds = stuck.map(c => c.id);
  const { data: calls } = await supabase
    .from('outbound_calls')
    .select('contact_id')
    .in('contact_id', contactIds);
  const contactIdsWithCall = new Set(
    ((calls ?? []) as OutboundCallRow[])
      .map(c => c.contact_id)
      .filter((id): id is string => id != null),
  );

  const stuckWithoutCall = stuck.filter(c => !contactIdsWithCall.has(c.id));
  if (stuckWithoutCall.length === 0) {
    return { totalStuck: 0, criticalStuck: 0, byAgent: [], level: 'ok' };
  }

  // 3. Agrupar por agent + edad del más viejo
  const criticalCutoffMs = nowMs - STUCK_OUTBOUND_HOURS_CRITICAL * 3600_000;
  const byAgentMap = new Map<string, { count: number; oldestMs: number }>();
  let criticalStuck = 0;

  for (const c of stuckWithoutCall) {
    const stampMs = new Date(c.updated_at ?? c.created_at).getTime();
    if (stampMs < criticalCutoffMs) criticalStuck++;

    const bucket = byAgentMap.get(c.agent_id) ?? { count: 0, oldestMs: stampMs };
    bucket.count++;
    if (stampMs < bucket.oldestMs) bucket.oldestMs = stampMs;
    byAgentMap.set(c.agent_id, bucket);
  }

  // 4. Resolver agent_name para el reporte
  const agentIds = Array.from(byAgentMap.keys());
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name')
    .in('id', agentIds);
  const nameById = new Map(((agents ?? []) as Array<{ id: string; agent_name: string | null }>)
    .map(a => [a.id, a.agent_name]));

  const byAgent = Array.from(byAgentMap.entries())
    .map(([agentId, bucket]) => ({
      agent_id:     agentId,
      agent_name:   nameById.get(agentId) ?? null,
      count:        bucket.count,
      oldest_hours: (nowMs - bucket.oldestMs) / 3600_000,
    }))
    .sort((a, b) => b.count - a.count);

  const level: 'warn' | 'critical' = criticalStuck > 0 ? 'critical' : 'warn';

  return {
    totalStuck: stuckWithoutCall.length,
    criticalStuck,
    byAgent,
    level,
  };
}
