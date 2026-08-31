import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export interface VerificationAttempt {
  called_at: string;
  result:    'ok' | 'no_visitado' | 'sin_respuesta';
  notes:     string | null;
}

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
  /** Historial completo de intentos. La última entrada corresponde a
   *  verification_called_at/verification_result (backwards compat). */
  verification_attempts:     VerificationAttempt[];
  /** Próxima llamada de verificación programada. Se popula desde
   *  outbound_contacts.scheduled_at cuando status='pending'. Null si no hay
   *  próximo callback (verificado ok, escalado a humano, o alta sin callback). */
  next_callback_at?:         string | null;
  next_callback_status?:     string | null;
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

export interface BitacoraKpis {
  total:     number;
  altas:     number;
  ok:        number;
  pendiente: number;
  rojo:      number;   // no_visitado + sin_respuesta (necesita atención)
  escalados: number;   // outbound_contact status='failed' (max intentos)
}

export interface UpcomingCallback {
  incident_id:  string;
  business:     string;
  contact_name: string | null;
  telefono:     string;
  scheduled_at: string;
  attempt_num:  number;
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

  const incidentRows = (incidents ?? []) as IncidentRow[];

  // Enrich con próximo callback programado (outbound_contact ligado por
  // external_id). Cada incident puede tener 0 o 1 contact pending activo.
  if (incidentRows.length > 0) {
    const incidentIds = incidentRows.map(i => i.id);
    const { data: contacts } = await supabase
      .from('outbound_contacts')
      .select('external_id, scheduled_at, status')
      .eq('agent_id', activeAgent.id)
      .eq('external_source', 'client_incident')
      .in('external_id', incidentIds) as {
        data: Array<{ external_id: string; scheduled_at: string | null; status: string | null }> | null;
      };
    const byIncidentId = new Map<string, { scheduled_at: string | null; status: string | null }>();
    for (const c of (contacts ?? [])) {
      if (c.external_id) byIncidentId.set(c.external_id, { scheduled_at: c.scheduled_at, status: c.status });
    }
    for (const inc of incidentRows) {
      const c = byIncidentId.get(inc.id);
      if (c) {
        inc.next_callback_at     = c.scheduled_at;
        inc.next_callback_status = c.status;
      }
    }
  }

  // KPIs agregados de la ventana actual
  const kpis: BitacoraKpis = {
    total:     incidentRows.length,
    altas:     0,
    ok:        0,
    pendiente: 0,
    rojo:      0,
    escalados: 0,
  };
  for (const inc of incidentRows) {
    if (inc.type === 'alta') kpis.altas++;
    else if (inc.verification_result === 'ok') kpis.ok++;
    else if (inc.verification_result === 'no_visitado' || inc.verification_result === 'sin_respuesta') kpis.rojo++;
    else kpis.pendiente++;
    if (inc.next_callback_status === 'failed') kpis.escalados++;
  }

  // Próximas llamadas del agente (max 5, ordenadas por fecha ascendente)
  const nowIso = new Date().toISOString();
  const upcoming: UpcomingCallback[] = [];
  if (enabled) {
    const { data: pending } = await supabase
      .from('outbound_contacts')
      .select('external_id, scheduled_at, telefono, nombre')
      .eq('agent_id', activeAgent.id)
      .eq('external_source', 'client_incident')
      .eq('status', 'pending')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(5) as {
        data: Array<{ external_id: string; scheduled_at: string; telefono: string; nombre: string | null }> | null;
      };
    if (pending?.length) {
      const ids = pending.map(p => p.external_id).filter(Boolean);
      const { data: incs } = await supabase
        .from('client_incidents')
        .select('id, business_name, contact_name, verification_attempts')
        .in('id', ids) as {
          data: Array<{ id: string; business_name: string; contact_name: string | null; verification_attempts: unknown[] | null }> | null;
        };
      const byId = new Map((incs ?? []).map(i => [i.id, i]));
      for (const p of pending) {
        const inc = byId.get(p.external_id);
        if (!inc) continue;
        const priorAttempts = Array.isArray(inc.verification_attempts) ? inc.verification_attempts.length : 0;
        upcoming.push({
          incident_id:  inc.id,
          business:     inc.business_name,
          contact_name: p.nombre ?? inc.contact_name,
          telefono:     p.telefono,
          scheduled_at: p.scheduled_at,
          attempt_num:  priorAttempts + 1,
        });
      }
    }
  }

  return {
    enabled,
    agent: activeAgent,
    bitacoraAgents,
    weekStart: rangeStart.toISOString(),
    rangeEnd:  rangeEnd.toISOString(),
    mode,
    incidents: incidentRows,
    kpis,
    upcoming,
  };
}
