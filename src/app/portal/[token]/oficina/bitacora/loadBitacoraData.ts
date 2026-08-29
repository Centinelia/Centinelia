import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export interface IncidentRow {
  id:                        string;
  type:                      'queja' | 'alta';
  created_at:                string;
  business_name:             string;
  sucursal:                  string | null;
  contact_name:              string | null;
  contact_phone:             string;
  address:                   string;
  motivo:                    string | null;
  vendedor:                  string | null;
  is_new_client:             boolean;
  verification_scheduled_at: string | null;
  verification_called_at:    string | null;
  verification_result:       'ok' | 'no_visitado' | 'sin_respuesta' | null;
  verification_result_notes: string | null;
}

export type BitacoraRangeMode = 'weekly' | 'monthly';

/**
 * Carga bitácora para un rango (semanal o mensual).
 *
 * - `weekly` (default): lunes 00:00 → lunes siguiente 00:00. Si pasas
 *   weekStartISO usa esa fecha como lunes; si no, calcula el lunes de la
 *   semana actual.
 * - `monthly`: día 1 del mes 00:00 → día 1 del mes siguiente 00:00. Si pasas
 *   monthStartISO usa esa fecha (típicamente día 1 del mes); si no, calcula
 *   día 1 del mes actual.
 *
 * `weekStart` en el retorno mantiene semántica del rango start (compat con
 * el UI existente que solo hace formato/navegación por semana).
 */
export async function loadBitacoraData(
  token: string,
  rangeStartISO?: string,
  mode: BitacoraRangeMode = 'weekly',
) {
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
  const rangeStart = rangeStartISO
    ? new Date(rangeStartISO)
    : (() => {
        const d = new Date(now);
        if (mode === 'monthly') {
          d.setDate(1);
          d.setHours(0, 0, 0, 0);
        } else {
          const day = d.getDay();
          const diff = day === 0 ? -6 : 1 - day;
          d.setDate(d.getDate() + diff);
          d.setHours(0, 0, 0, 0);
        }
        return d;
      })();
  const rangeEnd = new Date(rangeStart);
  if (mode === 'monthly') {
    rangeEnd.setMonth(rangeStart.getMonth() + 1);
  } else {
    rangeEnd.setDate(rangeStart.getDate() + 7);
  }

  const { data: incidents } = enabled
    ? await supabase
        .from('client_incidents')
        .select('*')
        .in('agent_id', agentIds)
        .gte('created_at', rangeStart.toISOString())
        .lt('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: true })
    : { data: [] };

  return {
    enabled,
    agent: agentRow,
    weekStart: rangeStart.toISOString(),
    rangeEnd:  rangeEnd.toISOString(),
    mode,
    incidents: (incidents ?? []) as IncidentRow[],
  };
}
