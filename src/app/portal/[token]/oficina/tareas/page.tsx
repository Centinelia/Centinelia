export const dynamic = 'force-dynamic';

import { createAdminClient }     from '@/lib/supabase/admin';
import { getAgentAccess }        from '@/lib/portal/agent-access';
import { resolveOrgFromToken }   from '@/lib/portal/org-token';
import TareasClient              from './TareasClient';

interface Props { params: Promise<{ token: string }> }

export default async function TareasPage({ params }: Props) {
  const { token } = await params;

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);

  const { data: agentsRaw } = resolved?.portalEmail
    ? await supabase
        .from('voice_agents')
        .select('id, agent_name, role, features')
        .eq('portal_email', resolved.portalEmail)
        .eq('active', true)
    : { data: [] };

  const agents = (agentsRaw ?? []).map((a: Record<string, unknown>) => ({
    id:              a.id as string,
    agent_name:      (a.agent_name as string | null) ?? null,
    role:            (a.role as string | null) ?? null,
    is_coordinator:  !!((a.features as Record<string, unknown>)?.is_coordinator),
    meerkat_role_id: ((a.features as Record<string, unknown>)?.meerkat_role_id as string | null) ?? null,
  }));

  // ── Counters para el hero (server-side, real-time) ────────────────────────
  const access = await getAgentAccess(token);
  const agentIds = access?.ids ?? [];
  const weekAgo  = new Date(Date.now() - 7 * 86400000).toISOString();

  const [activasRes, aprobRes, semanaRes, progRes] = agentIds.length > 0
    ? await Promise.all([
        // En curso: pending + running
        supabase.from('agent_tasks').select('id', { count: 'exact', head: true })
          .in('assigned_to', agentIds).in('status', ['pending', 'running']),
        // Aprobaciones pendientes
        supabase.from('agent_tasks').select('id', { count: 'exact', head: true })
          .in('assigned_to', agentIds).eq('status', 'awaiting_plan_approval'),
        // Completadas últimos 7 días
        supabase.from('agent_tasks').select('id', { count: 'exact', head: true })
          .in('assigned_to', agentIds).eq('status', 'completed').gte('completed_at', weekAgo),
        // Programadas activas
        supabase.from('agent_tasks').select('id', { count: 'exact', head: true })
          .in('assigned_to', agentIds).eq('trigger_type', 'scheduled')
,
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const counters = {
    activas:      activasRes?.count ?? 0,
    aprobaciones: aprobRes?.count   ?? 0,
    semana:       semanaRes?.count  ?? 0,
    programadas:  progRes?.count    ?? 0,
  };

  return <TareasClient token={token} agents={agents} counters={counters} />;
}
