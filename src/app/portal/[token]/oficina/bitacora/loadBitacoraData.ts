import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export interface IncidentRow {
  id:                        string;
  created_at:                string;
  business_name:             string;
  contact_name:              string | null;
  contact_phone:             string;
  address:                   string;
  motivo:                    string;
  vendedor:                  string | null;
  is_new_client:             boolean;
  verification_scheduled_at: string;
  verification_called_at:    string | null;
  verification_result:       'ok' | 'no_visitado' | 'sin_respuesta' | null;
  verification_result_notes: string | null;
}

export async function loadBitacoraData(token: string, weekStartISO?: string) {
  const supabase = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return null;

  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: { id: string; portal_email: string; business_name: string } | null };

  if (!agentRow) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('incidencia_flow_enabled')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { incidencia_flow_enabled: boolean | null } | null };

  const enabled = !!org?.incidencia_flow_enabled;

  // All agent_ids for this org (for the query scope)
  const { data: agentRows } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true) as { data: Array<{ id: string }> | null };

  const agentIds = (agentRows ?? []).map(a => a.id);

  const now = new Date();
  const monday = weekStartISO
    ? new Date(weekStartISO)
    : (() => {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const { data: incidents } = enabled
    ? await supabase
        .from('client_incidents')
        .select('*')
        .in('agent_id', agentIds)
        .gte('created_at', monday.toISOString())
        .lt('created_at', nextMonday.toISOString())
        .order('created_at', { ascending: true })
    : { data: [] };

  return {
    enabled,
    agent: agentRow,
    weekStart: monday.toISOString(),
    incidents: (incidents ?? []) as IncidentRow[],
  };
}
