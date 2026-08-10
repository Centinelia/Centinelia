export const dynamic = 'force-dynamic';

import { createAdminClient }        from '@/lib/supabase/admin';
import { getCommsRouting }          from '@/lib/comms/routing';
import { getAgentAccess }           from '@/lib/portal/agent-access';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies }           from 'next/headers';
import Link                  from 'next/link';
import { Headphones, Settings2, Inbox, AlertTriangle, Clock } from 'lucide-react';
import CommsRoutingEditor    from './CommsRoutingEditor';
import OpsInboxSection       from '../../OpsInboxSection';
import type { InboxAgent }   from '../../inbox/categories';

interface Props { params: Promise<{ token: string }> }

export default async function BandejaPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  // ── Session (para sub-user detection) ─────────────────────────────────────
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  const isItSubUser = !!(session?.isSubUser && session.modules?.includes('of_helpdesk'));

  // ── Agent + Access ────────────────────────────────────────────────────────
  const [agent, access] = await Promise.all([
    getPrimaryAgentFromToken<{ id: string; agent_name: string | null; features: Record<string, any> | null; guardia_schedule: unknown; directorio_interno: unknown; portal_email: string | null }>(
      token,
      'id, agent_name, features, guardia_schedule, directorio_interno, portal_email',
      supabase,
    ),
    getAgentAccess(token),
  ]);

  const vertical     = (agent as any)?.features?.vertical as string | undefined;
  const isGobierno   = vertical === 'gobierno';
  const commsRouting = isGobierno && agent ? await getCommsRouting(agent.id as string, supabase) : null;

  // ── Inbox agents (chips) ──────────────────────────────────────────────────
  let agents: InboxAgent[] = [];
  if ((agent as any)?.portal_email) {
    const { data } = await supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', (agent as any).portal_email);
    agents = (data ?? []) as InboxAgent[];
  }

  // ── Detectar si tiene Neo (para mostrar link a bandeja de IT) ─────────────
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

  // ── Contadores del hero ───────────────────────────────────────────────────
  const agentIds = access?.ids ?? [];
  const dayAgo   = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [pendingRes, escalatedRes, todayRes] = agentIds.length > 0
    ? await Promise.all([
        supabase.from('ops_inbox').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).in('status', ['pending', 'info_requested']),
        supabase.from('ops_inbox').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'escalated'),
        supabase.from('ops_inbox').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).gte('created_at', dayAgo),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }];

  const pendCount = pendingRes?.count ?? 0;
  const escCount  = escalatedRes?.count ?? 0;
  const todayCnt  = todayRes?.count ?? 0;
  const totalAtn  = pendCount + escCount;

  // Sub-usuarios de IT ven directo la bandeja IT — redirect suave
  // (mantenemos comportamiento existente de BandejaHelpdeskToggle)
  if (isItSubUser) {
    // Sub-usuario IT: le mostramos solo un mensaje simple + link a helpdesk.
    // El rediseño enfocado de la vista IT queda en /oficina/helpdesk.
    return (
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <header className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Bandeja
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Tu bandeja de IT
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            Como usuario de Helpdesk, tus tickets viven en la vista de Mesa de Ayuda.
          </p>
        </header>
        <Link
          href={`/portal/${token}/oficina/helpdesk`}
          className="inline-flex items-center gap-2 self-start px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          <Headphones size={15} />
          Ir a Mesa de Ayuda
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
          >
            <Inbox size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
              Bandeja
            </p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
              Correos y solicitudes
            </h1>
            <p className="text-[14px]" style={{ color: '#6B6480' }}>
              {totalAtn > 0
                ? <><strong style={{ color: '#1A0A3B' }}>{totalAtn}</strong> {totalAtn === 1 ? 'requiere' : 'requieren'} tu atención</>
                : <>Todo al día. Ninguna acción pendiente en este momento.</>}
            </p>
          </div>
        </div>

        {hasNeo && (
          <Link
            href={`/portal/${token}/oficina/helpdesk`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all shrink-0 hover:shadow-[0_4px_12px_rgba(108,59,255,0.15)]"
            style={{
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              color:      '#6C3BFF',
              boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
            }}
          >
            <Headphones size={14} strokeWidth={2.25} />
            Bandeja de IT
          </Link>
        )}
      </header>

      {/* ── KPIs de la bandeja (3 stat cards con divisores) ──────────────── */}
      <div
        className="grid grid-cols-3 rounded-2xl overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
      >
        <div className="flex flex-col gap-2 px-5 py-4" style={{ borderRight: '1px solid #F0EDF9' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.22)' }}>
              <Inbox size={13} style={{ color: '#6C3BFF' }} strokeWidth={2.25} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
              Pendientes
            </p>
          </div>
          <p className="text-[26px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#1A0A3B' }}>
            {pendCount}
          </p>
          <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
            {pendCount === 0 ? 'Todo revisado' : 'Esperan tu decisión'}
          </p>
        </div>
        <div className="flex flex-col gap-2 px-5 py-4" style={{ borderRight: '1px solid #F0EDF9', opacity: escCount === 0 ? 0.7 : 1 }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: escCount > 0 ? 'rgba(239,68,68,0.10)' : '#FAFAFB', border: `1px solid ${escCount > 0 ? 'rgba(239,68,68,0.25)' : '#E8E3F5'}` }}>
              <AlertTriangle size={13} style={{ color: escCount > 0 ? '#EF4444' : '#9B8FB5' }} strokeWidth={2.25} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
              Escalados
            </p>
          </div>
          <p className="text-[26px] font-bold leading-none tabular-nums tracking-tight" style={{ color: escCount > 0 ? '#EF4444' : '#1A0A3B' }}>
            {escCount}
          </p>
          <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
            {escCount === 0 ? 'Sin escalaciones' : 'Requieren tu revisión'}
          </p>
        </div>
        <div className="flex flex-col gap-2 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.25)' }}>
              <Clock size={13} style={{ color: '#0EA5E9' }} strokeWidth={2.25} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
              Últimas 24h
            </p>
          </div>
          <p className="text-[26px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#1A0A3B' }}>
            {todayCnt}
          </p>
          <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
            {todayCnt === 0 ? 'Sin actividad' : 'Correos recibidos'}
          </p>
        </div>
      </div>

      {/* ── OpsInboxSection — lista principal (mantiene su UX interna) ─── */}
      <OpsInboxSection token={token} agents={agents} />

      {/* ── Configuración de enrutamiento (solo gobierno, colapsable) ────── */}
      {commsRouting !== null && (
        <details className="group">
          <summary
            className="flex items-center gap-2 cursor-pointer px-4 py-3 rounded-xl transition-all list-none"
            style={{
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              color:      '#6B6480',
            }}
          >
            <Settings2 size={14} />
            <span className="text-[13px] font-semibold">Configuración de enrutamiento</span>
            <span className="text-[11px]" style={{ color: '#9B8FB5' }}>
              (a qué área va cada correo)
            </span>
          </summary>
          <div className="mt-3">
            <CommsRoutingEditor token={token} initial={commsRouting} />
          </div>
        </details>
      )}
    </div>
  );
}
