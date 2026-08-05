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
  lead_created:       { label: 'Leads',       color: '#10B981' },
  appointment_booked: { label: 'Citas',        color: '#3B82F6' },
  order_taken:        { label: 'Pedidos',      color: '#F59E0B' },
  transferred:        { label: 'Transferidos', color: '#8B5CF6' },
  info_provided:      { label: 'Información',  color: '#6B7280' },
  escalated_whatsapp: { label: 'WhatsApp',     color: '#25D366' },
  other:              { label: 'Otro',         color: '#4B5563' },
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

  const cap12 = new Date(Date.now() - 365 * 86400000).toISOString();
  const callsSince = since ?? cap12;
  const leadsSince = since ?? cap12;

  const [
    { data: calls },
    { data: agents },
    { data: leads },
    { data: opsLog },
  ] = await Promise.all([
    supabase.from('voice_calls')
      .select('id, outcome, duration_seconds, created_at, agent_id')
      .gte('created_at', callsSince)
      .order('created_at', { ascending: false }),
    supabase.from('voice_agents').select('id, agent_name, business_name, minutes_used, minutes_plan, plan, active, features').neq('id', process.env.DEMO_AGENT_ID ?? '').order('created_at'),
    supabase.from('leads_voice')
      .select('id, created_at, agent_id')
      .gte('created_at', leadsSince),
    supabase.from('ai_ops_log')
      .select('created_at')
      .gte('created_at', since ?? cap12),
  ]);

  const allCalls  = calls  ?? [];
  const allAgents = agents ?? [];
  const allLeads  = leads  ?? [];
  const allOps    = opsLog ?? [];

  const totalCalls     = allCalls.length;
  const totalDuration  = allCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const avgDuration    = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
  const totalLeads     = allLeads.length;
  const conversionRate = totalCalls > 0 ? ((totalLeads / totalCalls) * 100).toFixed(1) : '0';

  const totalOps      = allOps.length;
  const periodDays    = days ?? 365;
  const avgOpsPerDay  = totalOps > 0 ? totalOps / periodDays : 0;

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
    const meerkatRoleId = ((a as unknown as { features?: Record<string, unknown> }).features?.meerkat_role_id as string | undefined) ?? null;
    return {
      id: a.id,
      agent_name: (a as unknown as { agent_name?: string | null }).agent_name ?? null,
      business_name: a.business_name,
      meerkat_role_id: meerkatRoleId,
      plan: a.plan,
      active: a.active,
      mxn,
      calls: stats.calls,
      leads: stats.leads,
      avgMin,
      minutesUsed: a.minutes_used,
    };
  });

  const csvHref = `/api/admin/analytics/export${period ? `?period=${period}` : ''}`;

  const cardStyle: React.CSSProperties = {
    border: '1px solid #E5E7EB',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Analytics</h1>
            <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
              Métricas de llamadas, leads y capacidad del negocio.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#10B981' }}>
              ${mrr.toLocaleString('es-MX')}{' '}
              <span className="text-[15px] font-normal" style={{ color: '#6B7280' }}>MXN</span>
            </div>
            <div className="text-[12px] mt-1" style={{ color: '#6B7280' }}>MRR estimado · {activeAgentsCount} activos</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIOD_OPTIONS.map(({ label, param }) => {
            const active = (period ?? '') === param;
            return (
              <Link
                key={param}
                href={param ? `/admin/analytics?period=${param}` : '/admin/analytics'}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                style={{
                  background: active ? '#6C3BFF' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#374151',
                  border: `1px solid ${active ? '#6C3BFF' : '#E5E7EB'}`,
                }}
              >
                {label}
              </Link>
            );
          })}
          <a
            href={csvHref}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ background: '#FFFFFF', color: '#374151', border: '1px solid #E5E7EB' }}
          >
            <Download size={13} />
            CSV
          </a>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<Phone size={13} />}       label="Total llamadas"     value={totalCalls.toString()} color="#6C3BFF" />
        <KpiCard icon={<Clock size={13} />}       label="Duración promedio"  value={`${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`} color="#8B5CF6" />
        <KpiCard icon={<Users size={13} />}       label="Leads generados"    value={totalLeads.toString()} color="#10B981" />
        <KpiCard icon={<TrendingUp size={13} />}  label="Tasa de conversión" value={`${conversionRate}%`} color="#F59E0B" />
      </div>

      {/* Capacity projection */}
      <div className="rounded-xl bg-white px-6 py-5" style={cardStyle}>
        <h2 className="text-[15px] font-semibold mb-4" style={{ color: '#111827' }}>
          Capacidad proyectada
        </h2>

        {/* Minutes → Conversations */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
              style={{ background: '#F5F0FF', color: '#6C3BFF', border: '1px solid #DDD1FF' }}
            >
              Minutos, conversaciones
            </span>
          </div>
          {avgDuration === 0 ? (
            <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin llamadas registradas en el periodo. Acumula datos para ver la proyección.</p>
          ) : (
            <>
              <p className="text-[13px] mb-3" style={{ color: '#374151' }}>
                Duración promedio:{' '}
                <strong style={{ color: '#111827' }}>
                  {Math.floor(avgDuration / 60)}m {avgDuration % 60}s
                </strong>
                {' · '}{totalCalls} llamada{totalCalls !== 1 ? 's' : ''} ({period ? `últimos ${period} días` : 'últimos 12 meses'})
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { tier: 'Esencial',    minutes: 300 },
                  { tier: 'Profesional', minutes: 600 },
                  { tier: 'Avanzado',    minutes: 1200 },
                ].map(({ tier, minutes }) => {
                  const convs = Math.floor((minutes * 60) / avgDuration);
                  return (
                    <div
                      key={tier}
                      className="rounded-lg p-3 text-center"
                      style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                    >
                      <div className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>{tier} · {minutes} min</div>
                      <div className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: '#6C3BFF' }}>~{convs.toLocaleString('es-MX')}</div>
                      <div className="text-[12px] mt-1" style={{ color: '#6B7280' }}>conversaciones/mes</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ borderTop: '1px solid #F3F4F6', marginBottom: '1.25rem' }} />

        {/* Ops → Tasks */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-medium"
              style={{ background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE' }}
            >
              Tareas por mes
            </span>
          </div>
          {totalOps === 0 ? (
            <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin tareas registradas en el periodo. Activa empleados de oficina para acumular datos.</p>
          ) : (
            <>
              <p className="text-[13px] mb-3" style={{ color: '#374151' }}>
                Promedio actual:{' '}
                <strong style={{ color: '#111827' }}>
                  {avgOpsPerDay < 1 ? avgOpsPerDay.toFixed(2) : avgOpsPerDay.toFixed(1)} tareas/día
                </strong>
                {' · '}{totalOps.toLocaleString('es-MX')} tareas en {period ? `${period} días` : 'últimos 12 meses'}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { tier: 'Básico',    opsLimit: 100 },
                  { tier: 'Estándar',  opsLimit: 500 },
                  { tier: 'Ilimitado', opsLimit: 1000 },
                ].map(({ tier, opsLimit }) => {
                  const tasksPerMonth = Math.min(opsLimit, Math.floor(avgOpsPerDay * 30));
                  return (
                    <div
                      key={tier}
                      className="rounded-lg p-3 text-center"
                      style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                    >
                      <div className="text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>{tier} · {opsLimit} ops</div>
                      <div className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: '#3B82F6' }}>
                        ~{tasksPerMonth < opsLimit ? tasksPerMonth.toLocaleString('es-MX') : opsLimit.toLocaleString('es-MX')}
                      </div>
                      <div className="text-[12px] mt-1" style={{ color: '#6B7280' }}>
                        {tasksPerMonth >= opsLimit
                          ? 'límite alcanzado en 30 días'
                          : `tareas/mes · sobran ${(opsLimit - tasksPerMonth).toLocaleString('es-MX')} ops`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Calls chart */}
        <div className="rounded-xl bg-white px-6 py-5" style={cardStyle}>
          <h2 className="text-[11px] uppercase tracking-wider font-medium mb-4" style={{ color: '#9CA3AF' }}>
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
                    background: count > 0 ? '#6C3BFF' : '#F3F4F6',
                    minHeight: count > 0 ? '4px' : '2px',
                    cursor: 'default',
                  }}
                />
                <span className="truncate w-full text-center tabular-nums" style={{ color: '#9CA3AF', fontSize: '10px' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Peak hours */}
        <div className="rounded-xl bg-white px-6 py-5" style={cardStyle}>
          <h2 className="text-[11px] uppercase tracking-wider font-medium mb-4" style={{ color: '#9CA3AF' }}>
            Horas pico
            {totalCalls > 0 && <span className="ml-2 font-medium normal-case" style={{ color: '#F59E0B' }}>pico: {peakHour}:00</span>}
          </h2>
          <div className="flex items-end gap-px h-24">
            {hourCounts.map((count, h) => (
              <div key={h} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full rounded-sm"
                  title={`${h}:00 — ${count} llamada${count !== 1 ? 's' : ''}`}
                  style={{
                    height: `${Math.max((count / maxHourCount) * 88, count > 0 ? 3 : 0)}px`,
                    background: h === peakHour && count > 0 ? '#F59E0B' : count > 0 ? '#8B5CF6' : '#F3F4F6',
                    minHeight: count > 0 ? '3px' : '1px',
                    cursor: 'default',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="tabular-nums" style={{ color: '#9CA3AF', fontSize: '10px' }}>0h</span>
            <span className="tabular-nums" style={{ color: '#9CA3AF', fontSize: '10px' }}>12h</span>
            <span className="tabular-nums" style={{ color: '#9CA3AF', fontSize: '10px' }}>23h</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outcome distribution */}
        <div className="rounded-xl bg-white px-6 py-5" style={cardStyle}>
          <h2 className="text-[11px] uppercase tracking-wider font-medium mb-4" style={{ color: '#9CA3AF' }}>
            Resultados
          </h2>
          {totalCalls === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: '#6B7280' }}>Sin datos aún</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {Object.entries(outcomeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([outcome, count]) => {
                  const info = OUTCOME_LABELS[outcome] ?? OUTCOME_LABELS.other;
                  const pct  = Math.round((count / totalCalls) * 100);
                  return (
                    <div key={outcome}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[12px] font-medium" style={{ color: info.color }}>{info.label}</span>
                        <span className="text-[12px] tabular-nums" style={{ color: '#9CA3AF' }}>
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: '#F3F4F6' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: info.color }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Per-agent performance */}
        <div className="rounded-xl bg-white px-6 py-5" style={cardStyle}>
          <h2 className="text-[11px] uppercase tracking-wider font-medium mb-4" style={{ color: '#9CA3AF' }}>
            Por empleado
          </h2>
          <AnalyticsAgentsTable rows={agentRows} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      </div>
      <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{value}</div>
    </div>
  );
}
