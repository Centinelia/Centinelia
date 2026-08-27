import { createAdminClient }        from '@/lib/supabase/admin';
import { getAgentAccess }           from '@/lib/portal/agent-access';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export interface SeguimientoRow {
  id:              string;
  agent_id:        string;
  agent_name:      string | null;
  business_name:   string | null;
  nombre:          string | null;
  telefono:        string;
  motivo:          string | null;
  source:          string | null;
  status:          string;
  scheduled_at:    string | null;
  created_at:      string;
  tags:            string[] | null;
  // Link parent → escalación disparada. Cuando esta fila es la del cliente
  // que reportó el problema y Noah escaló al encargado, escalated_to_name
  // trae "Encargado Prueba" (o similar). Cuando esta fila es la escalación
  // misma (source='agent_escalation'), escalated_from_name trae el nombre
  // del cliente original.
  escalated_to_name?:   string | null;
  escalated_from_name?: string | null;
}

export interface SeguimientosPageData {
  showOutbound: boolean;
  initialized:  boolean;
  pending:      SeguimientoRow[];
  historial:    SeguimientoRow[];
  agents:       Array<{ id: string; agent_name: string | null; business_name: string }>;
}

export async function loadSeguimientosData(token: string): Promise<SeguimientosPageData | null> {
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<Record<string, unknown>>(token, '*', supabase);
  if (!agent) return null;

  const lookupEmail = (agent as { portal_email?: string | null }).portal_email ?? null;
  const { data: peers } = lookupEmail
    ? await supabase.from('voice_agents')
        .select('id, agent_name, business_name, features')
        .eq('portal_email', lookupEmail)
    : { data: [] };
  const allPeers = peers ?? [];

  const access   = await getAgentAccess(token);
  const agentIds = access?.ids ?? [(agent as { id: string }).id];

  // Gate visibility igual que Contactos: al menos un empleado del org tiene
  // outbound_calls encendido, si no el sub-user no puede usar esto.
  const anyHas       = (key: string) => allPeers.some(a => !!((a.features as Record<string, unknown> | null)?.[key]));
  const showOutbound = anyHas('outbound_calls') || (agent as { plan?: string }).plan === 'pro';
  const initialized  = anyHas('outbound_calls');

  const outboundAgents = allPeers
    .filter(a => !!((a.features as Record<string, unknown> | null)?.outbound_calls))
    .map(a => ({
      id:            a.id as string,
      agent_name:    (a as { agent_name?: string | null }).agent_name ?? null,
      business_name: (a as { business_name?: string }).business_name ?? '',
    }));

  // Pending: status='pending' ordenado por scheduled_at ascendente (los que
  // salen antes van arriba). Sin cap temporal — mostramos todo lo agendado.
  // Historial: últimos 30 días de status IN ('completed','calling','failed','canceled')
  // para que el user pueda ver qué se hizo (transparencia).
  const nowIso     = new Date().toISOString();
  const monthAgoIso = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [pendingRes, historialRes] = showOutbound
    ? await Promise.all([
        supabase
          .from('outbound_contacts')
          .select('id,agent_id,nombre,telefono,motivo,source,status,scheduled_at,created_at,tags,external_source,external_id')
          .in('agent_id', agentIds)
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true, nullsFirst: false })
          .limit(200),
        supabase
          .from('outbound_contacts')
          .select('id,agent_id,nombre,telefono,motivo,source,status,scheduled_at,created_at,tags,external_source,external_id')
          .in('agent_id', agentIds)
          .in('status', ['completed', 'calling', 'failed', 'canceled'])
          .gte('created_at', monthAgoIso)
          .order('created_at', { ascending: false })
          .limit(100),
      ])
    : [{ data: [] }, { data: [] }];

  const peerNameMap = new Map<string, { agent_name: string | null; business_name: string | null }>();
  for (const p of allPeers) {
    peerNameMap.set(p.id as string, {
      agent_name:    (p as { agent_name?: string | null }).agent_name ?? null,
      business_name: (p as { business_name?: string | null }).business_name ?? null,
    });
  }

  const hydrate = (rows: Record<string, unknown>[]): SeguimientoRow[] =>
    rows.map(r => {
      const peer = peerNameMap.get(r.agent_id as string);
      return {
        id:              r.id as string,
        agent_id:        r.agent_id as string,
        agent_name:      peer?.agent_name ?? null,
        business_name:   peer?.business_name ?? null,
        nombre:          (r.nombre as string | null) ?? null,
        telefono:        r.telefono as string,
        motivo:          (r.motivo as string | null) ?? null,
        source:          (r.source as string | null) ?? null,
        status:          r.status as string,
        scheduled_at:    (r.scheduled_at as string | null) ?? null,
        created_at:      r.created_at as string,
        tags:            (r.tags as string[] | null) ?? null,
        // Los links se resuelven abajo con un pass posterior sobre todas las
        // filas agregadas (necesitamos el universo completo para el join).
        escalated_to_name:   null,
        escalated_from_name: null,
      };
    });

  const pending   = hydrate((pendingRes.data ?? []) as Record<string, unknown>[]);
  const historial = hydrate((historialRes.data ?? []) as Record<string, unknown>[]);

  // Resolver links parent ↔ escalación. Recorremos las escalaciones y por
  // cada una: (1) marcamos su parent contact con escalated_to_name, (2) le
  // ponemos su escalated_from_name mirando al parent.
  const universeById = new Map<string, SeguimientoRow>();
  for (const r of [...pending, ...historial]) universeById.set(r.id, r);
  const rawUniverse: Array<Record<string, unknown>> = [
    ...((pendingRes.data ?? []) as Record<string, unknown>[]),
    ...((historialRes.data ?? []) as Record<string, unknown>[]),
  ];
  for (const raw of rawUniverse) {
    const source        = raw.source as string | null;
    const externalSource = raw.external_source as string | null;
    const externalId     = raw.external_id as string | null;
    if (source !== 'agent_escalation' || externalSource !== 'agent_escalation_from' || !externalId) continue;
    const escalation = universeById.get(raw.id as string);
    const parent     = universeById.get(externalId);
    if (escalation && parent) {
      parent.escalated_to_name       = escalation.nombre ?? escalation.telefono;
      escalation.escalated_from_name = parent.nombre ?? parent.telefono;
    }
  }

  return {
    showOutbound,
    initialized,
    pending,
    historial,
    agents:    outboundAgents,
  };
}
