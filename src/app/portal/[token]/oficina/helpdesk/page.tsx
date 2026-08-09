export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Headphones, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { GuardiaSchedule } from '@/lib/helpdesk/folio';
import HelpdeskSection   from './HelpdeskSection';
import IncidentesSection from './IncidentesSection';
import GuardiaEditor     from './GuardiaEditor';
import MeerkatPicker     from '../../agentes/MeerkatPicker';

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

  // Horario de guardia vive en organizations (org-scoped). El directorio de personas también,
  // pero se edita en /organizacion → Directorio, no aquí.
  const { data: org } = agent?.portal_email
    ? await supabase.from('organizations')
        .select('guardia_schedule')
        .eq('portal_email', agent.portal_email as string)
        .single()
    : { data: null };

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

  // KPIs de incidentes activos vs resueltos (solo owner ve)
  const activeCount   = (incidents ?? []).filter((i: any) => i.activo).length;
  const resolvedCount = (incidents ?? []).filter((i: any) => !i.activo).length;

  return (
    <div id="of-helpdesk" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      {/* ── Hero de la Mesa de Ayuda ─────────────────────────────────────── */}
      {isItSubUser ? (
        // Sub-usuario IT: hero más compacto, personal
        <header className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-[20px] font-bold"
            style={{
              background: 'rgba(108,59,255,0.1)',
              border:     '1px solid rgba(108,59,255,0.25)',
              color:      '#6C3BFF',
            }}
          >
            {subUserName?.charAt(0).toUpperCase() ?? session?.portalEmail?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
              Mesa de ayuda
            </p>
            <h1 className="text-[24px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
              {subUserName ? `Hola, ${subUserName}.` : 'Tu queue de soporte.'}
            </h1>
            <p className="text-[13px]" style={{ color: '#6B6480' }}>
              Aquí ves los tickets asignados a ti.
            </p>
          </div>
        </header>
      ) : hasNeo ? (
        // Owner con Neo: hero con imagen + estado + KPIs de guardia
        <>
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
              >
                <Headphones size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
                  Mesa de ayuda
                </p>
                <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
                  Soporte técnico
                </h1>
                <p className="text-[14px]" style={{ color: '#6B6480' }}>
                  <strong style={{ color: '#1A0A3B' }}>{employeeName}</strong> está monitoreando solicitudes, incidentes y pendientes.
                </p>
              </div>
            </div>
          </header>

          {/* KPIs — 3 stat cards */}
          <div
            className="grid grid-cols-3 rounded-2xl overflow-hidden"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
          >
            <div className="flex flex-col gap-2 px-5 py-4" style={{ borderRight: '1px solid #F0EDF9' }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22C55E', boxShadow: '0 0 8px #22C55E' }} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  Disponibilidad
                </p>
              </div>
              <p className="text-[18px] font-bold leading-none tracking-tight" style={{ color: '#16A34A' }}>
                Disponible
              </p>
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                Guardia: {scheduleLabel}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-5 py-4" style={{ borderRight: '1px solid #F0EDF9', opacity: activeCount === 0 ? 0.7 : 1 }}>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: activeCount > 0 ? 'rgba(239,68,68,0.10)' : '#FAFAFB', border: `1px solid ${activeCount > 0 ? 'rgba(239,68,68,0.25)' : '#E8E3F5'}` }}>
                  <AlertTriangle size={13} style={{ color: activeCount > 0 ? '#EF4444' : '#9B8FB5' }} strokeWidth={2.25} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  Incidentes activos
                </p>
              </div>
              <p className="text-[26px] font-bold leading-none tabular-nums tracking-tight" style={{ color: activeCount > 0 ? '#EF4444' : '#1A0A3B' }}>
                {activeCount}
              </p>
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                {activeCount === 0 ? 'Sin incidentes activos' : 'Reportados por clientes'}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.25)' }}>
                  <Clock size={13} style={{ color: '#0EA5E9' }} strokeWidth={2.25} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  Última actividad
                </p>
              </div>
              <p className="text-[15px] font-bold leading-none tracking-tight" style={{ color: '#1A0A3B' }}>
                {lastActivity ?? 'Sin actividad'}
              </p>
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                {resolvedCount > 0 ? `${resolvedCount} resuelto${resolvedCount !== 1 ? 's' : ''}` : 'Aún sin incidentes'}
              </p>
            </div>
          </div>
        </>
      ) : (
        // Owner SIN Neo: upsell card cyan-ámbar
        <>
          <header className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
            >
              <Headphones size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
                Mesa de ayuda
              </p>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
                Soporte técnico
              </h1>
              <p className="text-[14px]" style={{ color: '#6B6480' }}>
                Registra tickets manualmente o contrata Neo para que los reciba por teléfono.
              </p>
            </div>
          </header>

          {/* Upsell card — Neo */}
          <div
            className="flex items-stretch rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(245,158,11,0.06) 60%, #ffffff 100%)',
              border:     '1px solid rgba(6,182,212,0.30)',
              boxShadow:  '0 4px 20px rgba(6,182,212,0.08)',
            }}
          >
            <img
              src="/meerkats/neo.png"
              alt="Neo"
              className="w-36 h-36 object-contain object-bottom shrink-0 self-end"
            />
            <div className="flex-1 min-w-0 py-5 pr-5 pl-2 flex flex-col justify-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#0891B2', letterSpacing: '0.08em' }}>
                Contrata a Neo
              </p>
              <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Neo no está en tu equipo.
              </h2>
              <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
                Sin Neo los tickets se registran solo de forma manual. Neo recibe solicitudes por teléfono, las clasifica automáticamente y las asigna al técnico de guardia.
              </p>
              <div className="mt-2">
                <MeerkatPicker
                  token={token}
                  plan={plan as 'pro'}
                  defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                  preselect="neo"
                  triggerLabel="Contratar Neo"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Incidentes (solo owner) */}
      {!isItSubUser && (
        <IncidentesSection token={token} initialIncidents={incidents ?? []} />
      )}

      {/* Tickets del helpdesk */}
      <HelpdeskSection token={token} subUserName={subUserName} employeeName={employeeName} />

      {/* Configuración de guardia (solo owner) */}
      {!isItSubUser && (
        <section
          className="flex flex-col gap-4 rounded-2xl overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.22)' }}
            >
              <Clock size={18} style={{ color: '#6C3BFF' }} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Horarios de guardia
              </h2>
              <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>
                Define quién atiende y en qué horarios. Neo asigna cada ticket al técnico de guardia según el área y el momento del día.
              </p>
            </div>
          </div>
          <div className="px-5 pb-5" style={{ borderTop: '1px solid #F0EDF9' }}>
            <div className="pt-4">
              <GuardiaEditor token={token} initial={guardia} />
            </div>
            <p className="text-[12px] mt-4 leading-relaxed" style={{ color: '#9B8FB5' }}>
              Los técnicos, especialistas y demás personas viven en el directorio de tu organización.{' '}
              <Link
                href={`/portal/${token}?tab=negocio&nav=directorio`}
                className="font-semibold transition-opacity hover:opacity-80"
                style={{ color: '#6C3BFF' }}
              >
                Editar directorio →
              </Link>
            </p>
          </div>
        </section>
      )}

    </div>
  );
}
