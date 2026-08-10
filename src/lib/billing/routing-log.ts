import type { createAdminClient } from '@/lib/supabase/admin';

type SB = ReturnType<typeof createAdminClient>;

export type RoutingTransition =
  | 'fallback_activated'
  | 'fallback_restored'
  | 'no_fallback_paused';

export interface LogParams {
  portal_email:      string;
  agent_id?:         string | null;
  caller_number?:    string | null;
  transition:        RoutingTransition;
  minutes_used?:     number | null;
  minutes_included?: number | null;
}

export async function logRoutingTransition(supabase: SB, params: LogParams): Promise<void> {
  const { error } = await supabase.from('routing_transitions').insert({
    portal_email:      params.portal_email,
    agent_id:          params.agent_id ?? null,
    caller_number:     params.caller_number ?? null,
    transition:        params.transition,
    minutes_used:      params.minutes_used ?? null,
    minutes_included:  params.minutes_included ?? null,
  });
  if (error) {
    console.warn('[routing-log] insert failed:', error.message);
  }
}
