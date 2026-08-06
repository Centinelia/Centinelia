export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCommsRouting }   from '@/lib/comms/routing';
import { getAgentAccess }    from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies }           from 'next/headers';
import Link                  from 'next/link';
import { Headphones, Settings2 }  from 'lucide-react';
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
  const [{ data: agent }, access] = await Promise.all([
    supabase
      .from('voice_agents')
      .select('id, agent_name, features, guardia_schedule, directorio_interno, portal_email')
      .eq('portal_token', token)
      .single(),
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
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Bandeja
          </p>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Correos y solicitudes
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            {totalAtn > 0 ? (
              <>
                <strong style={{ color: '#1A0A3B' }}>{totalAtn}</strong> {totalAtn === 1 ? 'requiere' : 'requieren'} tu atención
                {escCount > 0 && <> · <strong style={{ color: '#EF4444' }}>{escCount}</strong> escalado{escCount !== 1 ? 's' : ''}</>}
                {' · '}{todayCnt} en las últimas 24h
              </>
            ) : (
              <>Todo al día. {todayCnt} {todayCnt === 1 ? 'evento' : 'eventos'} en las últimas 24h.</>
            )}
          </p>
        </div>

        {hasNeo && (
          <Link
            href={`/portal/${token}/oficina/helpdesk`}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all shrink-0"
            style={{
              background: '#ffffff',
              border:     '1px solid #E8E3F5',
              color:      '#6C3BFF',
              boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
            }}
          >
            <Headphones size={14} />
            Ver bandeja de IT
          </Link>
        )}
      </header>

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
