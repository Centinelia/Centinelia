export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCommsRouting } from '@/lib/comms/routing';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies } from 'next/headers';
import type { GuardiaSchedule } from '@/lib/helpdesk/folio';
import CommsRoutingEditor from './CommsRoutingEditor';
import AttentionPanel from '../AttentionPanel';
import BandejaHelpdeskToggle from './BandejaHelpdeskToggle';
import type { InboxAgent } from '../../inbox/categories';

interface Props { params: Promise<{ token: string }> }

export default async function BandejaPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  // ── Session (for helpdesk sub-user detection) ──────────────────────────────
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const isItSubUser = !!(session?.isSubUser && session.modules?.includes('of_helpdesk'));

  let subUserName: string | null = null;
  if (isItSubUser && session?.userId) {
    const { data: pu } = await supabase
      .from('portal_users')
      .select('name')
      .eq('id', session.userId)
      .single();
    subUserName = (pu?.name as string | null) ?? null;
  }

  // ── Agent + Access ─────────────────────────────────────────────────────────
  const [{ data: agent }, access] = await Promise.all([
    supabase
      .from('voice_agents')
      .select('id, agent_name, features, guardia_schedule, directorio_interno, portal_email, plan, minutes_plan')
      .eq('portal_token', token)
      .single(),
    getAgentAccess(token),
  ]);

  const vertical     = (agent as any)?.features?.vertical as string | undefined;
  const isGobierno   = vertical === 'gobierno';
  const commsRouting = isGobierno && agent ? await getCommsRouting(agent.id as string, supabase) : null;

  // ── Inbox agents (for OpsInboxSection agent chips) ─────────────────────────
  let agents: InboxAgent[] = [];
  if ((agent as any)?.portal_email) {
    const { data } = await supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', (agent as any).portal_email);
    agents = (data ?? []) as InboxAgent[];
  }

  // ── Helpdesk: Neo check ────────────────────────────────────────────────────
  let hasNeo = false;
  if (!isItSubUser && agent?.portal_email) {
    const { data: peers } = await supabase
      .from('voice_agents')
      .select('features')
      .eq('portal_email', agent.portal_email as string);
    hasNeo = (peers ?? []).some(
      (p: any) => (p.features as Record<string, unknown>)?.meerkat_role_id === 'neo'
    );
  }

  // ── Helpdesk: IT incidents (owner only) ────────────────────────────────────
  const { data: incidents } = (!isItSubUser && access)
    ? await supabase
        .from('it_incidents')
        .select('*')
        .in('agent_id', access.ids)
        .order('created_at', { ascending: false })
    : { data: [] };

  // ── Helpdesk: derived display values ──────────────────────────────────────
  const plan        = (agent as any)?.plan         ?? 'pro';
  const defaultTier = (agent as any)?.minutes_plan ?? 'starter';

  const guardia: GuardiaSchedule = (agent?.guardia_schedule as GuardiaSchedule) ?? { areas: [] };
  const totalTurnos   = guardia.areas.reduce((n, a) => n + a.turnos.length, 0);
  const scheduleLabel = guardia.areas.length === 0
    ? '24/7'
    : `${guardia.areas.length} área${guardia.areas.length !== 1 ? 's' : ''}, ${totalTurnos} turno${totalTurnos !== 1 ? 's' : ''}`;

  const employeeName    = ((agent as any)?.agent_name as string | null)?.trim() || 'Tu empleado';
  const lastActivityRaw = (incidents ?? [])[0]?.created_at ?? null;
  const lastActivity    = lastActivityRaw
    ? new Date(lastActivityRaw).toLocaleString('es-MX', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div id="of-bandeja" className="flex flex-col gap-6">
      <AttentionPanel token={token} />
      {commsRouting !== null && (
        <CommsRoutingEditor token={token} initial={commsRouting} />
      )}
      <BandejaHelpdeskToggle
        token={token}
        agents={agents}
        isItSubUser={isItSubUser}
        subUserName={subUserName}
        hasNeo={hasNeo}
        employeeName={employeeName}
        scheduleLabel={scheduleLabel}
        lastActivity={lastActivity}
        incidents={incidents ?? []}
        plan={plan}
        defaultTier={defaultTier}
      />
    </div>
  );
}
