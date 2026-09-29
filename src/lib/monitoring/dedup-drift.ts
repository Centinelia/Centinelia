// Drift detector para el middleware de dedup (spec §8.2).
//
// Vigila dos anomalías por org:
//  1) SPIKE: rows/hora en tool_call_dedup > 3× baseline de 4 semanas previas.
//     Señal de que el modelo está reinvocando tools de más (prompt drift,
//     modelo nuevo, o config mala).
//  2) CERO_HITS: 24h sin filas nuevas en un org con volumen normal. Señal
//     de que el middleware está roto (fail-open silencioso).

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEDUP_SPIKE_THRESHOLD  = 3.0;
export const DEDUP_SPIKE_MIN_CURRENT = 20;
export const DEDUP_CERO_HITS_BASELINE_MIN_PER_DAY = 20;

export type DedupAnomalyType = 'spike' | 'cero_hits';

export interface DedupAnomaly {
  portal_email: string;
  type:         DedupAnomalyType;
  current_rows: number;
  baseline_avg: number;
  ratio:        number | null;
}

/**
 * Detecta anomalías en el uso del middleware de dedup para un org.
 * NO usa notification_events, solo devuelve el análisis; el caller decide.
 */
export async function detectDedupAnomalies(
  supabase: SupabaseClient,
  portalEmail: string,
  nowMs: number = Date.now(),
): Promise<DedupAnomaly[]> {
  const anomalies: DedupAnomaly[] = [];

  const oneWeekMs = 7 * 86_400_000;
  const currentSince = new Date(nowMs - oneWeekMs).toISOString();
  const baselineFrom = new Date(nowMs - 5 * oneWeekMs).toISOString();
  const baselineTo   = new Date(nowMs - oneWeekMs).toISOString();

  const { count: currentCount } = await supabase
    .from('tool_call_dedup')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'voice')
    .in('agent_id', (
      await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail)
    ).data?.map((a: { id: string }) => a.id) ?? [])
    .gte('created_at', currentSince);

  const { count: baselineCount } = await supabase
    .from('tool_call_dedup')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'voice')
    .in('agent_id', (
      await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail)
    ).data?.map((a: { id: string }) => a.id) ?? [])
    .gte('created_at', baselineFrom)
    .lt('created_at', baselineTo);

  const current  = currentCount ?? 0;
  const baseline = (baselineCount ?? 0) / 4;

  if (current >= DEDUP_SPIKE_MIN_CURRENT && baseline > 0) {
    const ratio = current / baseline;
    if (ratio > DEDUP_SPIKE_THRESHOLD) {
      anomalies.push({
        portal_email: portalEmail,
        type:         'spike',
        current_rows: current,
        baseline_avg: baseline,
        ratio,
      });
    }
  }

  const last24Since = new Date(nowMs - 86_400_000).toISOString();
  const { count: last24 } = await supabase
    .from('tool_call_dedup')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'voice')
    .in('agent_id', (
      await supabase.from('voice_agents').select('id').eq('portal_email', portalEmail)
    ).data?.map((a: { id: string }) => a.id) ?? [])
    .gte('created_at', last24Since);

  if ((last24 ?? 0) === 0 && baseline / 7 >= DEDUP_CERO_HITS_BASELINE_MIN_PER_DAY) {
    anomalies.push({
      portal_email: portalEmail,
      type:         'cero_hits',
      current_rows: 0,
      baseline_avg: baseline,
      ratio:        null,
    });
  }

  return anomalies;
}
