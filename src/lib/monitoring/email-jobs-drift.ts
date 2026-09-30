// Drift detector para email_send_jobs (spec §7.4).
// Vigila 2 anomalías por org:
//  1) STUCK: 3+ jobs pending/processing con created_at > 10 min. Señal de
//     cron caído o retries acumulándose.
//  2) FAILURE_SPIKE: failed última hora / total última hora > 20% con
//     total >= 5. Señal de SMTP down o config mala.
//
// Nash llama detectEmailJobsAnomalies desde el runner (throttled).

import type { SupabaseClient } from '@supabase/supabase-js';

export const STUCK_THRESHOLD_MIN     = 10;
export const STUCK_MIN_COUNT         = 3;
export const FAILURE_RATE_THRESHOLD  = 0.20;
export const FAILURE_MIN_TOTAL       = 5;

export type EmailJobAnomalyType = 'stuck' | 'failure_spike';

export interface EmailJobAnomaly {
  portal_email: string;
  type:         EmailJobAnomalyType;
  detail:       string;
  count:        number;
}

async function agentIds(supabase: SupabaseClient, portalEmail: string): Promise<string[]> {
  const { data } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail);
  return ((data as Array<{ id: string }> | null) ?? []).map(a => a.id);
}

export async function detectEmailJobsAnomalies(
  supabase:    SupabaseClient,
  portalEmail: string,
): Promise<EmailJobAnomaly[]> {
  const anomalies: EmailJobAnomaly[] = [];
  const nowMs = Date.now();
  const stuckCutoff = new Date(nowMs - STUCK_THRESHOLD_MIN * 60_000).toISOString();
  const hourAgo     = new Date(nowMs - 60 * 60_000).toISOString();

  // 1. Stuck (pending o processing con created_at antiguo)
  const ids1 = await agentIds(supabase, portalEmail);
  const { count: stuckCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', ids1)
    .in('status', ['pending', 'processing'])
    .lt('created_at', stuckCutoff);

  if ((stuckCount ?? 0) >= STUCK_MIN_COUNT) {
    anomalies.push({
      portal_email: portalEmail,
      type:         'stuck',
      detail:       `${stuckCount} jobs pending/processing con >${STUCK_THRESHOLD_MIN} min`,
      count:        stuckCount ?? 0,
    });
  }

  // 2. Failure spike (failed última hora / total última hora)
  const ids2 = await agentIds(supabase, portalEmail);
  const { count: failedCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', ids2)
    .eq('status', 'failed')
    .gte('failed_at', hourAgo);

  const ids3 = await agentIds(supabase, portalEmail);
  const { count: totalCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .in('agent_id', ids3)
    .gte('created_at', hourAgo);

  const total = totalCount ?? 0;
  const failed = failedCount ?? 0;
  if (total >= FAILURE_MIN_TOTAL && (failed / total) > FAILURE_RATE_THRESHOLD) {
    anomalies.push({
      portal_email: portalEmail,
      type:         'failure_spike',
      detail:       `${failed}/${total} jobs failed última hora (${Math.round(failed/total*100)}%)`,
      count:        failed,
    });
  }

  return anomalies;
}
