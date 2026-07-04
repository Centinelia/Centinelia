export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { PhoneCall, Clock, Users, AlertTriangle, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

const PLAN_LABELS: Record<string, string> = { comercial: 'Comercial', pro: 'Pro' };

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  lead_created:       { label: 'Lead',        color: '#22c55e' },
  appointment_booked: { label: 'Cita',         color: '#3b82f6' },
  order_taken:        { label: 'Pedido',       color: '#f59e0b' },
  transferred:        { label: 'Transferido',  color: '#a855f7' },
  info_provided:      { label: 'Información',  color: '#6b7280' },
  escalated_whatsapp: { label: 'WhatsApp',     color: '#25D366' },
  other:              { label: 'Otro',         color: '#4b5563' },
};

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: agents },
    { data: calls24h },
    { data: recentCalls },
    { data: lastCallsAll },
  ] = await Promise.all([
    supabase.from('voice_agents')
      .select('id, business_name, plan, minutes_used, minutes_included, active')
      .order('business_name'),
    supabase.from('voice_calls')
      .select('id, agent_id, duration_seconds')
      .gte('created_at', since24h),
    supabase.from('voice_calls')
      .select('id, agent_id, caller_number, outcome, duration_seconds, created_at')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase.from('voice_calls')
      .select('agent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const agentList = agents ?? [];
  const callList24h = calls24h ?? [];

  const agentMap: Record<string, string> = {};
  for (const a of agentList) agentMap[a.id] = a.business_name;

  const lastCallMap: Record<string, string> = {};
  for (const c of (lastCallsAll ?? [])) {
    if (!lastCallMap[c.agent_id]) lastCallMap[c.agent_id] = c.created_at;
  }

  const todayMinutes  = callList24h.reduce((s, c) => s + Math.ceil((c.duration_seconds ?? 0) / 60), 0);
  const activeAgents  = agentList.filter(a => a.active).length;
  const criticalAgents = agentList.filter(a => a.active && a.minutes_included > 0 && (a.minutes_used / a.minutes_included) > 0.8);
  const inactiveAgents = agentList.filter(a => !a.active);

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<Users size={18} />}         label="Agentes activos"  value={`${activeAgents} / ${agentList.length}`} color="#22c55e" />
        <KpiCard icon={<PhoneCall size={18} />}     label="Llamadas (24h)"   value={String(callList24h.length)}              color="#6C3BFF" />
        <KpiCard icon={<Clock size={18} />}         label="Minutos (24h)"    value={String(todayMinutes)}                    color="#a855f7" />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label="Al límite (>80%)"
          value={String(criticalAgents.length)}
          color={criticalAgents.length > 0 ? '#ef4444' : '#22c55e'}
          sub={criticalAgents.length === 0 ? 'Todo bien' : 'requieren atención'}
        />
      </div>

      {/* Alerts */}
      {(criticalAgents.length > 0 || inactiveAgents.length > 0) && (
        <div className="mb-6 flex flex-col gap-2">
          {criticalAgents.map(a => {
            const pct = Math.round((a.minutes_used / a.minutes_included) * 100);
            const color = pct >= 100 ? '#ef4444' : '#f59e0b';
            return (
              <Link key={a.id} href={`/admin/agentes/${a.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:opacity-90 transition-opacity"
                style={{ background: `${color}0f`, border: `1px solid ${color}33` }}>
                <AlertTriangle size={14} style={{ color, flexShrink: 0 }} />
                <span className="text-sm flex-1" style={{ color: 'var(--c-text)' }}>{a.business_name}</span>
                <span className="text-xs font-semibold" style={{ color }}>{pct}% de minutos usados</span>
                <ArrowRight size={13} style={{ color: 'var(--c-text-3)' }} />
              </Link>
            );
          })}
          {inactiveAgents.map(a => (
            <Link key={a.id} href={`/admin/agentes/${a.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:opacity-90 transition-opacity"
              style={{ background: 'rgba(107,114,128,0.06)', border: '1px solid rgba(107,114,128,0.2)' }}>
              <XCircle size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
              <span className="text-sm flex-1" style={{ color: 'var(--c-text)' }}>{a.business_name}</span>
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Agente pausado</span>
              <ArrowRight size={13} style={{ color: 'var(--c-text-3)' }} />
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {/* Agents status table */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Estado de agentes</h2>
            <Link href="/admin/agentes"
              className="text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-80 transition-opacity"
              style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
              Ver todos →
            </Link>
          </div>

          {agentList.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center gap-3">
              <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin agentes configurados</p>
              <Link href="/admin/agentes/nuevo"
                className="text-xs px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                + Crear primer agente
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {agentList.map(a => {
                const pct = a.minutes_included > 0 ? Math.min((a.minutes_used / a.minutes_included) * 100, 100) : 0;
                const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
                const lastCall = lastCallMap[a.id];
                const daysSince = lastCall
                  ? Math.floor((Date.now() - new Date(lastCall).getTime()) / 86400000)
                  : null;

                return (
                  <Link key={a.id} href={`/admin/agentes/${a.id}`}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>

                    {/* Status icon */}
                    {a.active
                      ? <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                      : <XCircle    size={14} style={{ color: '#6b7280', flexShrink: 0 }} />}

                    {/* Name + minutes bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{a.business_name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                          {PLAN_LABELS[a.plan] ?? a.plan}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--c-border-2)' }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="text-xs flex-shrink-0 tabular-nums" style={{ color: 'var(--c-text-3)' }}>
                          {a.minutes_used}/{a.minutes_included} min
                        </span>
                      </div>
                    </div>

                    {/* Last call */}
                    <div className="text-right flex-shrink-0 hidden sm:block w-20">
                      {daysSince === null
                        ? <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Sin llamadas</span>
                        : daysSince === 0
                          ? <span className="text-xs font-medium" style={{ color: '#22c55e' }}>Hoy</span>
                          : daysSince === 1
                            ? <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>Ayer</span>
                            : <span className="text-xs" style={{ color: daysSince > 7 ? '#f59e0b' : 'var(--c-text-3)' }}>
                                Hace {daysSince}d
                              </span>}
                    </div>

                    <ArrowRight size={13} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent calls */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <h2 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: 'var(--c-text-3)' }}>Llamadas recientes</h2>
          {(recentCalls ?? []).length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: 'var(--c-text-4)' }}>
              Sin llamadas registradas aún — aparecerán aquí en tiempo real
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(recentCalls ?? []).map(call => (
                <Link key={call.id} href={`/admin/agentes/${call.agent_id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--c-text)' }}>{call.caller_number || 'Desconocido'}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{agentMap[call.agent_id] ?? ''}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <OutcomeBadge outcome={call.outcome} />
                    <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
                      {Math.ceil(call.duration_seconds / 60)}m
                    </span>
                    <span className="text-xs hidden sm:block" style={{ color: 'var(--c-text-4)' }}>
                      {new Date(call.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: string; color: string; sub?: string;
}) {
  return (
    <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center gap-2 mb-3" style={{ color }}>{icon}</div>
      <div className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>{sub}</div>}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.other;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${o.color}22`, color: o.color }}>
      {o.label}
    </span>
  );
}
