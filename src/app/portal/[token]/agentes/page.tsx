export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import Link                             from 'next/link';
import { Phone, Settings2, Briefcase, Plus, Bot, Zap } from 'lucide-react';
import PauseResumeButton               from '../PauseResumeButton';
import AgentAvatarPicker               from '../AgentAvatarPicker';

const COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
function agentColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

const PLAN_LABELS: Record<string, string> = { comercial: 'Comercial', pro: 'Pro' };
const PLAN_COLORS: Record<string, string> = { comercial: '#3b82f6', pro: '#a855f7' };

interface Props { params: Promise<{ token: string }> }

export default async function AgentesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: baseAgent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name')
    .eq('portal_token', token)
    .single();
  if (!baseAgent) notFound();

  if (session?.portalEmail && baseAgent.portal_email && baseAgent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  const lookupEmail = session?.portalEmail ?? baseAgent.portal_email ?? null;

  const { data: agentsRaw } = lookupEmail
    ? await supabase
        .from('voice_agents')
        .select('id, agent_name, role, plan, phone_number, active, client_paused, billing_status, portal_token, features, business_name, ai_ops_used')
        .eq('portal_email', lookupEmail)
        .order('created_at', { ascending: true })
    : { data: [] };

  const agents = agentsRaw ?? [];

  // Calls this month per agent
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const callCounts = await Promise.all(agents.map(async a => {
    const { count } = await supabase
      .from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', a.id)
      .gte('created_at', monthStart.toISOString());
    return { id: a.id, count: count ?? 0 };
  }));
  const callCountMap = Object.fromEntries(callCounts.map(c => [c.id, c.count]));

  return (
    <div className="flex flex-col gap-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Mis Agentes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {agents.length} {agents.length === 1 ? 'agente' : 'agentes'} · {baseAgent.business_name}
          </p>
        </div>
        <Link
          href={`/registro?back=/portal/${token}`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <Plus size={13} />
          Agregar agente
        </Link>
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 rounded-2xl"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
            <Bot size={22} style={{ color: '#6C3BFF', opacity: 0.5 }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin agentes en tu cuenta</p>
        </div>
      )}

      {/* Agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {agents.map(a => {
          const color           = agentColor(a.id);
          const initial         = ((a.agent_name as string | null)?.trim() || (a.business_name as string)).charAt(0).toUpperCase();
          const isBillingPaused = !(a.active as boolean) && (a.billing_status as string) === 'pago_fallido';
          const isClientPaused  = !!(a.client_paused as boolean) && !isBillingPaused;
          const isOnline        = (a.active as boolean) && !isClientPaused && !isBillingPaused;
          const planColor       = PLAN_COLORS[(a.plan as string) ?? ''] ?? '#6b7280';
          const hasRole         = !!((a.role as string | null)?.trim());
          const roleColor       = ((a.features as any)?.role_color as string | null) || '#6C3BFF';
          const avatarSrc       = ((a.features as any)?.avatar as string | null) || null;
          const callCount       = callCountMap[a.id] ?? 0;

          const statusLabel = isBillingPaused ? 'Pago pendiente' : isClientPaused ? 'Pausado' : isOnline ? 'Activo' : 'Inactivo';
          const statusColor = isBillingPaused ? '#dc2626' : isClientPaused ? '#f59e0b' : isOnline ? '#16a34a' : '#6b7280';

          return (
            <div key={a.id}
              className="rounded-2xl p-5 flex flex-col items-center justify-between aspect-square"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

              {/* Avatar — grande, centrado arriba */}
              <AgentAvatarPicker
                token={a.portal_token as string}
                avatarSrc={avatarSrc}
                initial={initial}
                color={hasRole ? roleColor : color}
                size={148}
              />

              {/* Nombre + rol + badges */}
              <div className="flex flex-col items-center gap-1 text-center w-full">
                <span className="font-bold text-base sm:text-xl leading-tight" style={{ color: 'var(--c-text)' }}>
                  {(a.agent_name as string | null)?.trim() || 'Centinelia'}
                </span>
                {hasRole && (
                  <span className="text-sm sm:text-base font-medium" style={{ color: roleColor }}>
                    {a.role as string}
                  </span>
                )}
                <div className="flex items-center gap-1.5 flex-wrap justify-center mt-1">
                  {(a.plan as string | null) && (
                    <span className="text-xs sm:text-sm px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${planColor}15`, color: planColor, border: `1px solid ${planColor}25` }}>
                      {PLAN_LABELS[(a.plan as string)] ?? (a.plan as string)}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs sm:text-sm" style={{ color: statusColor }}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOnline ? 'animate-pulse' : ''}`}
                      style={{ background: 'currentColor' }} />
                    {statusLabel}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-center gap-4 w-full" style={{ color: 'var(--c-text-3)' }}>
                <span className="flex items-center gap-1 text-sm sm:text-base">
                  <Bot size={14} />
                  {callCount} llam. este mes
                </span>
                {hasRole && (
                  <span className="flex items-center gap-1 text-sm sm:text-base">
                    <Zap size={14} />
                    {(a.ai_ops_used as number) ?? 0} ops este mes
                  </span>
                )}
              </div>

              {/* Botones — abajo */}
              <div className="flex items-center gap-2 w-full pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
                <Link
                  href={`/portal/${a.portal_token as string}/configurar`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: `${color}12`, color, border: `1px solid ${color}30` }}
                >
                  <Settings2 size={11} />
                  Configurar
                </Link>
                {hasRole && (
                  <Link
                    href={`/portal/${a.portal_token as string}/oficina`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}
                  >
                    <Briefcase size={11} />
                    Oficina
                  </Link>
                )}
                <div className="flex-1" />
                {!isBillingPaused
                  ? <PauseResumeButton agentId={a.id} clientPaused={isClientPaused} />
                  : (
                    <a
                      href={`/api/billing/portal-session?token=${a.portal_token as string}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                      Resolver pago →
                    </a>
                  )
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
