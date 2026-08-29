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
export interface BitacoraAgentSummary {
  id:            string;
  agent_name:    string;
  business_name: string;
  incident_count: number;
}

export async function loadBitacoraData(
  token: string,
  rangeStartISO?: string,
  mode: BitacoraRangeMode = 'weekly',
  targetAgentId?: string,
) {
  const supabase = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('incidencia_flow_enabled')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { incidencia_flow_enabled: boolean | null } | null };

  const enabled = !!org?.incidencia_flow_enabled;

  // Todos los agentes activos del org
  const { data: agentRows } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true }) as {
      data: Array<{ id: string; agent_name: string; business_name: string }> | null
    };

  if (!agentRows || agentRows.length === 0) return null;

  const agentIds = agentRows.map(a => a.id);

  // Empleados con actividad histórica en bitácora (al menos 1 incident registrada)
  // — sirven para poblar los tabs de la página.
  const { data: countRows } = enabled
    ? await supabase
        .from('client_incidents')
        .select('agent_id')
        .in('agent_id', agentIds) as { data: Array<{ agent_id: string }> | null }
    : { data: [] };

  const countByAgent = new Map<string, number>();
  (countRows ?? []).forEach(r => {
    countByAgent.set(r.agent_id, (countByAgent.get(r.agent_id) ?? 0) + 1);
  });

  const bitacoraAgents: BitacoraAgentSummary[] = agentRows
    .filter(a => (countByAgent.get(a.id) ?? 0) > 0)
    .map(a => ({
      id:            a.id,
      agent_name:    a.agent_name,
      business_name: a.business_name,
      incident_count: countByAgent.get(a.id) ?? 0,
    }));

  // Empleado activo (tab seleccionada). Si no viene param, usa el primero
  // con incidencias. Si no hay ninguno con incidencias, usa el primer agente
  // activo (para que la página tenga contexto de "quién es" aunque tabla vacía).
  const activeAgent = targetAgentId
    ? agentRows.find(a => a.id === targetAgentId)
    : (bitacoraAgents[0] ? agentRows.find(a => a.id === bitacoraAgents[0].id) : agentRows[0]);

  if (!activeAgent) return null;

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
        .eq('agent_id', activeAgent.id)
        .gte('created_at', rangeStart.toISOString())
        .lt('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: true })
    : { data: [] };

  return {
    enabled,
    agent: activeAgent,
    bitacoraAgents,
    weekStart: rangeStart.toISOString(),
    rangeEnd:  rangeEnd.toISOString(),
    mode,
    incidents: (incidents ?? []) as IncidentRow[],
  };
}
