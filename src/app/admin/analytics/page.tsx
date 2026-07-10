export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { Phone, Clock, TrendingUp, Users, Download } from 'lucide-react';
import Link from 'next/link';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { MinutesTier } from '@/lib/billing/plans';
import type { Plan } from '@/types/agent';
import AnalyticsAgentsTable from './AnalyticsAgentsTable';
import type { AgentRow } from './AnalyticsAgentsTable';

interface Props {
  searchParams: Promise<{ period?: string }>;
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  lead_created:       { label: 'Leads',       color: '#22c55e' },
  appointment_booked: { label: 'Citas',        color: '#3b82f6' },
  order_taken:        { label: 'Pedidos',      color: '#f59e0b' },
  transferred:        { label: 'Transferidos', color: '#a855f7' },
  info_provided:      { label: 'Información',  color: '#6b7280' },
  escalated_whatsapp: { label: 'WhatsApp',     color: '#25D366' },
  other:              { label: 'Otro',         color: '#4b5563' },
};

const PERIOD_OPTIONS = [
  { label: '7 días',  param: '7' },
  { label: '30 días', param: '30' },
  { label: '90 días', param: '90' },
  { label: 'Todo',    param: '' },
];

// ── Chart data builder ────────────────────────────────────────────────────────

type ChartEntry = { label: string; count: number };

function buildChartData(allCalls: { created_at: string }[], days?: number): { entries: ChartEntry[]; title: string } {
  const today = new Date();

  if (!days) {
    // Monthly buckets, last 12 months
    const buckets: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets[d.toISOString().slice(0, 7)] = 0;
    }
    for (const call of allCalls) {
      const key = call.created_at.slice(0, 7);
      if (key in buckets) buckets[key]++;
    }
    return {
      title: 'Llamadas, últimos 12 meses',
      entries: Object.entries(buckets).map(([m, count]) => ({
        label: new Date(m + '-15').toLocaleDateString('es-MX', { month: 'short' }),
        count,
      })),
    };
  }

  if (days > 30) {
    // Weekly buckets, 13 weeks
    const buckets = new Map<string, number>();
    for (let i = 12; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i * 7);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = mon.toISOString().slice(0, 10);
      if (!buckets.has(key)) buckets.set(key, 0);
    }
    for (const call of allCalls) {
      const d   = new Date(call.created_at);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = mon.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      title: 'Llamadas, últimas 13 semanas',
      entries: sorted.map(([w, count]) => ({
        label: new Date(w + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
        count,
      })),
    };
  }

  // Daily buckets, 7 or 30 days
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const call of allCalls) {
    const key = call.created_at.slice(0, 10);
    if (key in buckets) buckets[key]++;
  }
  return {
    title: `Llamadas, últimos ${days} días`,
    entries: Object.entries(buckets).map(([d, count]) => ({
      label: new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit' }),
      count,
    })),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage({ searchParams }: Props) {
  const { period } = await searchParams;
  const days  = period ? parseInt(period) : undefined;
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  const supabase = createAdminClient();

  // Cap "Todo" to last 12 months — charts only show 12 months and select('*') on
  // unbounded voice_calls would download transcripts/recordings at scale.
  const cap12 = new Date(Date.now() - 365 * 86400000).toISOString();
  const callsSince = since ?? cap12;
  const leadsSince = since ?? cap12;

  const [
    { data: calls },
    { data: agents },
    { data: leads },
  ] = await Promise.all([
    supabase.from('voice_calls')
      .select('id, outcome, duration_seconds, created_at, agent_id')
      .gte('created_at', callsSince)
      .order('created_at', { ascending: false }),
    supabase.from('voice_agents').select('id, business_name, minutes_used, minutes_plan, plan, active').neq('id', process.env.DEMO_AGENT_ID ?? '').order('created_at'),
    supabase.from('leads_voice')
      .select('id, created_at, agent_id')
      .gte('created_at', leadsSince),
  ]);

  const allCalls  = calls  ?? [];
  const allAgents = agents ?? [];
  const allLeads  = leads  ?? [];

  const totalCalls     = allCalls.length;
  const totalDuration  = allCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const avgDuration    = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
  const totalLeads     = allLeads.length;
  const conversionRate = totalCalls > 0 ? ((totalLeads / totalCalls) * 100).toFixed(1) : '0';

  const mrr = allAgents
    .filter(a => a.active && a.minutes_plan)
    .reduce((sum, a) => sum + (MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier]?.mxn ?? 0), 0);
  const activeAgentsCount = allAgents.filter(a => a.active).length;

  const outcomeCounts: Record<string, number> = {};
  for (const call of allCalls) {
    outcomeCounts[call.outcome] = (outcomeCounts[call.outcome] ?? 0) + 1;
  }

  const hourCounts  = Array(24).fill(0);
  for (const call of allCalls) {
    hourCounts[new Date(call.created_at).getHours()]++;
  }
  const peakHour    = hourCounts.indexOf(Math.max(...hourCounts));
  const maxHourCount = Math.max(...hourCounts, 1);

  const { entries: chartEntries, title: chartTitle } = buildChartData(allCalls, days);
  const maxChartCount = Math.max(...chartEntries.map(e => e.count), 1);

  const agentCallMap: Record<string, { calls: number; leads: number; duration: number }> = {};
  for (const call of allCalls) {
    if (!agentCallMap[call.agent_id]) agentCallMap[call.agent_id] = { calls: 0, leads: 0, duration: 0 };
    agentCallMap[call.agent_id].calls++;
    agentCallMap[call.agent_id].duration += call.duration_seconds ?? 0;
  }
  for (const lead of allLeads) {
    if (!agentCallMap[lead.agent_id]) agentCallMap[lead.agent_id] = { calls: 0, leads: 0, duration: 0 };
    agentCallMap[lead.agent_id].leads++;
  }

  const agentRows: AgentRow[] = allAgents.map(a => {
    const stats  = agentCallMap[a.id] ?? { calls: 0, leads: 0, duration: 0 };
    const avgMin = stats.calls > 0 ? Math.round(stats.duration / stats.calls / 60) : 0;
    const mxn    = (a.plan && a.minutes_plan) ? (MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier]?.mxn ?? 0) : 0;
    return { id: a.id, business_name: a.business_name, plan: a.plan, active: a.active, mxn, calls: stats.calls, leads: stats.leads, avgMin, minutesUsed: a.minutes_used };
  });

  const csvHref = `/api/admin/analytics/export${period ? `?period=${period}` : ''}`;

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Analytics</h1>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold" style={{ color: '#22c55e' }}>
              ${mrr.toLocaleString('es-MX')} <span className="text-base font-normal" style={{ color: 'var(--c-text-3)' }}>MXN</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>MRR estimado · {activeAgentsCount} activos</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {PERIOD_OPTIONS.map(({ label, param }) => {
              const active = (period ?? '') === param;
              return (
                <Link
                  key={param}
                  href={param ? `/admin/analytics?period=${param}` : '/admin/analytics'}
                  className="flex-1 text-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? '#6C3BFF' : 'var(--c-surface)',
                    color: active ? '#fff' : 'var(--c-text-3)',
                    border: `1px solid ${active ? '#6C3BFF' : 'var(--c-border)'}`,
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <a
            href={csvHref}
            className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            <Download size={12} />
            CSV
          </a>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<Phone size={18} />}     label="Total llamadas"     value={totalCalls.toString()} color="#6C3BFF" />
        <KpiCard icon={<Clock size={18} />}      label="Duración promedio"  value={`${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`} color="#a855f7" />
        <KpiCard icon={<Users size={18} />}      label="Leads generados"    value={totalLeads.toString()} color="#22c55e" />
        <KpiCard icon={<TrendingUp size={18} />} label="Tasa de conversión" value={`${conversionRate}%`} color="#f59e0b" />
      </div>

      {/* Capacity projection */}
      <div className="mb-6 p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Capacidad proyectada
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF' }}>
            Planificación: minutos → conversaciones
          </span>
        </div>
        {avgDuration === 0 ? (
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin llamadas registradas en el periodo. Acumula datos para ver la proyección.</p>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--c-text-2)' }}>
              Duración promedio actual:{' '}
              <strong style={{ color: 'var(--c-text)' }}>
                {Math.floor(avgDuration / 60)}m {avgDuration % 60}s
              </strong>
              {' '}· basado en {totalCalls} llamada{totalCalls !== 1 ? 's' : ''} ({period ? `últimos ${period} días` : 'últimos 12 meses'})
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { tier: 'Starter', minutes: 300 },
                { tier: 'Growth',  minutes: 600 },
                { tier: 'Scale',   minutes: 1200 },
              ].map(({ tier, minutes }) => {
                const convs = Math.floor((minutes * 60) / avgDuration);
                return (
                  <div key={tier} className="rounded-lg p-3 text-center" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>{tier} · {minutes} min</div>
                    <div className="text-2xl font-bold" style={{ color: '#6C3BFF' }}>~{convs.toLocaleString('es-MX')}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>conversaciones/mes</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Calls chart */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            {chartTitle}
          </h2>
          <div className="flex items-end gap-1 h-24">
            {chartEntries.map(({ label, count }, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div
                  className="w-full rounded-sm transition-all"
                  title={`${label}: ${count} llamada${count !== 1 ? 's' : ''}`}
                  style={{
                    height: `${Math.max((count / maxChartCount) * 88, count > 0 ? 4 : 0)}px`,
                    background: count > 0 ? '#6C3BFF' : 'var(--c-border)',
                    minHeight: count > 0 ? '4px' : '2px',
                    cursor: 'default',
                  }}
                />
                <span className="truncate w-full text-center" style={{ color: 'var(--c-text-4)', fontSize: '9px' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Peak hours */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Horas pico
            {totalCalls > 0 && <span className="ml-2 font-normal normal-case" style={{ color: '#f59e0b' }}>pico: {peakHour}:00</span>}
          </h2>
          <div className="flex items-end gap-px h-24">
            {hourCounts.map((count, h) => (
              <div key={h} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full rounded-sm"
                  title={`${h}:00 — ${count} llamada${count !== 1 ? 's' : ''}`}
                  style={{
                    height: `${Math.max((count / maxHourCount) * 88, count > 0 ? 3 : 0)}px`,
                    background: h === peakHour && count > 0 ? '#f59e0b' : count > 0 ? '#a855f7' : 'var(--c-border)',
                    minHeight: count > 0 ? '3px' : '1px',
                    cursor: 'default',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ color: 'var(--c-text-4)', fontSize: '9px' }}>0h</span>
            <span style={{ color: 'var(--c-text-4)', fontSize: '9px' }}>12h</span>
            <span style={{ color: 'var(--c-text-4)', fontSize: '9px' }}>23h</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcome distribution */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Resultados
          </h2>
          {totalCalls === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Sin datos aún</p>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(outcomeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([outcome, count]) => {
                  const info = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.other;
                  const pct  = Math.round((count / totalCalls) * 100);
                  return (
                    <div key={outcome}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs" style={{ color: info.color }}>{info.label}</span>
                        <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--c-border)' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: info.color }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Per-agent performance */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Por agente
          </h2>
          <AnalyticsAgentsTable rows={agentRows} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center gap-2 mb-3" style={{ color }}>{icon}</div>
      <div className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{label}</div>
    </div>
  );
}
