export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies } from 'next/headers';
import type { GuardiaSchedule, DirectoryPerson } from '@/lib/helpdesk/folio';
import HelpdeskSection   from './HelpdeskSection';
import IncidentesSection from './IncidentesSection';
import DirectorioEditor  from '../../DirectorioEditor';
import GuardiaEditor     from './GuardiaEditor';
import MeerkatPicker     from '../../agentes/MeerkatPicker';
import { Card }          from '@/components/portal-ui';

interface Props { params: Promise<{ token: string }> }

export default async function HelpdeskPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

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

  const [{ data: agent }, access] = await Promise.all([
    supabase.from('voice_agents').select('id, agent_name, features, portal_email, plan, minutes_plan').eq('portal_token', token).single(),
    getAgentAccess(token),
  ]);

  // Directorio + guardia viven en organizations (org-scoped, no por agente).
  const { data: org } = agent?.portal_email
    ? await supabase.from('organizations')
        .select('directory, guardia_schedule')
        .eq('portal_email', agent.portal_email as string)
        .single()
    : { data: null };

  const directory: DirectoryPerson[] = ((org as any)?.directory ?? []);
  const isOwnerSession = !session?.isSubUser;

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

  const { data: incidents } = (!isItSubUser && access)
    ? await supabase.from('it_incidents').select('*').in('agent_id', access.ids).order('created_at', { ascending: false })
    : { data: [] };

  const plan        = (agent as any)?.plan         ?? 'pro';
  const defaultTier = (agent as any)?.minutes_plan ?? 'starter';

  const guardia: GuardiaSchedule = ((org as any)?.guardia_schedule as GuardiaSchedule) ?? { areas: [] };

  const employeeName    = ((agent as any)?.agent_name as string | null)?.trim() || 'Tu empleado';
  const totalTurnos     = guardia.areas.reduce((n, a) => n + a.turnos.length, 0);
  const scheduleLabel   = guardia.areas.length === 0
    ? '24/7'
    : `${guardia.areas.length} área${guardia.areas.length !== 1 ? 's' : ''}, ${totalTurnos} turno${totalTurnos !== 1 ? 's' : ''}`;
  const lastActivityRaw = (incidents ?? [])[0]?.created_at ?? null;
  const lastActivity    = lastActivityRaw
    ? new Date(lastActivityRaw).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div id="of-helpdesk" className="flex flex-col gap-6 p-4 md:p-6">

      {isItSubUser ? (
        <Card padding="none" border elevated={false} className="flex items-center gap-3 px-4 py-3" style={{ border: '1px solid var(--c-border-2)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
            style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
            {subUserName?.charAt(0).toUpperCase() ?? session?.portalEmail?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--c-text-4)' }}>
              Mesa de ayuda
            </p>
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
              {subUserName ? `Hola, ${subUserName}.` : 'Tu queue de soporte.'}
              <span className="ml-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
                Tickets asignados a ti.
              </span>
            </p>
          </div>
        </Card>
      ) : hasNeo ? (
        <Card padding="none" border elevated={false} className="flex overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
          <img src="/meerkats/neo.png" alt="Neo"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
          <div className="flex-1 min-w-0 py-4 pr-4 pl-3 flex flex-col justify-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-4)' }}>
              Mesa de ayuda
            </p>
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
              {employeeName} está monitoreando solicitudes, incidentes y pendientes.
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#22c55e' }} />
                Disponible
              </span>
              <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Guardia: {scheduleLabel}</span>
              {lastActivity && (
                <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Última actividad: {lastActivity}</span>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card padding="none" border elevated={false} className="flex overflow-hidden"
          style={{ background: 'linear-gradient(to right, rgba(6,182,212,0.07), rgba(245,158,11,0.07))', border: '1px solid rgba(6,182,212,0.25)' }}>
          <img src="/meerkats/neo.png" alt="Neo"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
          <div className="flex-1 min-w-0 py-4 pr-4 pl-3 flex flex-col justify-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(6,182,212,0.7)' }}>
              Mesa de ayuda
            </p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold leading-snug" style={{ color: '#06b6d4' }}>
                Neo no está en tu equipo.
              </p>
              <div style={{ marginRight: 30 }}>
                <MeerkatPicker
                  token={token}
                  plan={plan as 'pro'}
                  defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                  preselect="neo"
                  triggerLabel="Contratar"
                />
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Sin Neo los tickets se registran solo de forma manual. Neo recibe solicitudes por teléfono, las clasifica y las asigna al técnico de guardia.
            </p>
          </div>
        </Card>
      )}

      {!isItSubUser && (
        <IncidentesSection token={token} initialIncidents={incidents ?? []} />
      )}

      <HelpdeskSection token={token} subUserName={subUserName} />

      {!isItSubUser && (
        <div className="flex flex-col gap-4 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
            Directorio de la organización
          </p>
          <DirectorioEditor token={token} initial={directory} isOwner={isOwnerSession} showHelpdeskFields />
          <GuardiaEditor    token={token} initial={guardia} />
        </div>
      )}

    </div>
  );
}
