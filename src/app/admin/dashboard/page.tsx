export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';
import {
  AlertTriangle, ArrowRight, DollarSign,
  Users, PhoneCall, UserPlus,
} from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase   = createAdminClient();
  const now        = Date.now();
  const since14d   = new Date(now - 14 * 86400000).toISOString();
  const since7d    = new Date(now -  7 * 86400000);
  const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { data: agentsData },
    { data: calls14d },
    { data: lastCallsData },
  ] = await Promise.all([
    supabase.from('voice_agents')
      .select('id, business_name, client_name, plan, minutes_plan, minutes_used, minutes_included, active, billing_status, created_at')
      .neq('id', process.env.DEMO_AGENT_ID ?? '')
      .order('created_at', { ascending: false }),
    supabase.from('voice_calls')
      .select('id, agent_id, created_at')
      .gte('created_at', since14d),
    supabase.from('voice_calls')
      .select('agent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const agents = (agentsData ?? []) as any[];
  const calls  = (calls14d   ?? []) as any[];

  // MRR — only agents with billing_status = 'activo' and a known minutes plan
  const mrr = agents
    .filter(a => a.billing_status === 'activo' && a.plan && a.minutes_plan && a.minutes_plan !== 'enterprise')
    .reduce((sum: number, a: any) => {
      const cfg = MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier];
      return sum + (cfg?.mxn ?? 0);
    }, 0);

  // Active agent count
  const activeCount = agents.filter(a => a.active).length;

  // Week-over-week call trend
  const callsThisWeek = calls.filter(c => new Date(c.created_at) >= since7d).length;
  const callsLastWeek = calls.filter(c => new Date(c.created_at)  < since7d).length;
  const callsDelta    = callsLastWeek > 0
    ? Math.round(((callsThisWeek - callsLastWeek) / callsLastWeek) * 100)
    : null;

  // New agents this calendar month
  const newThisMonth = agents.filter(a => a.created_at >= startMonth).length;

  // Last call per agent
  const lastCallMap: Record<string, Date> = {};
  for (const c of (lastCallsData ?? [])) {
    if (!lastCallMap[c.agent_id]) lastCallMap[c.agent_id] = new Date(c.created_at);
  }

  // Prioritized alerts
  type Alert = { priority: number; label: string; sub: string; href: string; color: string };
  const alerts: Alert[] = [];

  for (const a of agents) {
    if (a.billing_status === 'pago_fallido') {
      alerts.push({ priority: 0, label: a.business_name, sub: 'Pago fallido — contactar cliente', href: '/admin/billing', color: '#ef4444' });
    }
  }

  for (const a of agents) {
    if (a.active && a.minutes_included > 0 && (a.minutes_used / a.minutes_included) >= 0.9) {
      const pct = Math.round((a.minutes_used / a.minutes_included) * 100);
      alerts.push({ priority: 1, label: a.business_name, sub: `${pct}% de minutos consumidos — ofrecer recarga`, href: `/admin/agentes/${a.id}`, color: '#f59e0b' });
    }
  }

  const sevenDaysAgo = new Date(now - 7 * 86400000);
  for (const a of agents) {
    if (!a.active) continue;
    const last = lastCallMap[a.id];
    if (!last || last < sevenDaysAgo) {
      const days = last ? Math.floor((now - last.getTime()) / 86400000) : null;
      const sub  = days === null ? 'Sin llamadas registradas — ¿problema?' : `Sin llamadas hace ${days} días — ¿problema?`;
      alerts.push({ priority: 2, label: a.business_name, sub, href: `/admin/agentes/${a.id}`, color: '#6b7280' });
    }
  }

  // Minutes health
  const withMinutes    = agents.filter(a => a.active && a.minutes_included > 0);
  const minsOk         = withMinutes.filter(a => (a.minutes_used / a.minutes_included) <  0.70).length;
  const minsWarning    = withMinutes.filter(a => { const p = a.minutes_used / a.minutes_included; return p >= 0.70 && p < 0.90; }).length;
  const minsCritical   = withMinutes.filter(a => (a.minutes_used / a.minutes_included) >= 0.90).length;
  const totalRemaining = agents.reduce((s: number, a: any) => s + Math.max(0, (a.minutes_included ?? 0) - (a.minutes_used ?? 0)), 0);

  // Billing summary
  const billing = {
    activo:       agents.filter(a => a.billing_status === 'activo').length,
    pago_fallido: agents.filter(a => a.billing_status === 'pago_fallido').length,
    sin_plan:     agents.filter(a => !a.billing_status || a.billing_status === 'sin_plan').length,
    cancelado:    agents.filter(a => a.billing_status === 'cancelado').length,
  };

  const trendSub = callsDelta === null
    ? 'Sin datos semana anterior'
    : `${callsDelta >= 0 ? '+' : ''}${callsDelta}% vs semana anterior`;
  const trendColor = callsDelta === null ? 'var(--c-text-4)' : callsDelta >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={<DollarSign size={16} />}
          label="MRR estimado"
          value={`$${mrr.toLocaleString('es-MX')}`}
          sub="MXN / mes"
          color="#22c55e"
        />
        <KpiCard
          icon={<Users size={16} />}
          label="Agentes activos"
          value={String(activeCount)}
          sub={`de ${agents.length} totales`}
          color="#6C3BFF"
        />
        <KpiCard
          icon={<PhoneCall size={16} />}
          label="Llamadas esta semana"
          value={String(callsThisWeek)}
          sub={trendSub}
          subColor={trendColor}
          color="#a855f7"
        />
        <KpiCard
          icon={<UserPlus size={16} />}
          label="Nuevos clientes"
          value={String(newThisMonth)}
          sub="este mes"
          color="#3b82f6"
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--c-text-3)' }}>
            Acción requerida
          </h2>
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => (
              <Link key={i} href={alert.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:opacity-90 transition-opacity"
                style={{ background: `${alert.color}10`, border: `1px solid ${alert.color}30` }}>
                <AlertTriangle size={14} style={{ color: alert.color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none" style={{ color: 'var(--c-text)' }}>{alert.label}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>{alert.sub}</p>
                </div>
                <ArrowRight size={13} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Minutes Health */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Salud de minutos
            </h2>
            <Link href="/admin/agentes" className="text-xs hover:opacity-70 transition-opacity" style={{ color: 'var(--c-text-3)' }}>
              Ver agentes →
            </Link>
          </div>

          {withMinutes.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-4)' }}>Sin agentes activos con plan de minutos</p>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                <MinutesRow label="OK"       count={minsOk}       of={withMinutes.length} color="#22c55e" hint="< 70% consumido" />
                <MinutesRow label="Alerta"   count={minsWarning}   of={withMinutes.length} color="#f59e0b" hint="70–90% consumido" />
                <MinutesRow label="Crítico"  count={minsCritical}  of={withMinutes.length} color="#ef4444" hint="≥ 90% consumido" />
              </div>
              <div className="mt-4 pt-4 flex justify-between text-xs"
                style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                <span>Minutos disponibles total</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--c-text-2)' }}>
                  {totalRemaining.toLocaleString('es-MX')} min
                </span>
              </div>
            </>
          )}
        </div>

        {/* Billing Summary */}
        <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Estado de facturación
            </h2>
            <Link href="/admin/billing" className="text-xs hover:opacity-70 transition-opacity" style={{ color: 'var(--c-text-3)' }}>
              Ver billing →
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <BillingRow label="Al corriente"    count={billing.activo}       color="#22c55e" />
            <BillingRow label="Pago fallido"    count={billing.pago_fallido} color="#ef4444" />
            <BillingRow label="Sin plan activo" count={billing.sin_plan}     color="#6b7280" />
            <BillingRow label="Cancelados"      count={billing.cancelado}    color="#374151" />
          </div>
          <div className="mt-4 pt-4 flex justify-between text-xs"
            style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
            <span>Total agentes registrados</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--c-text-2)' }}>{agents.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color, subColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  subColor?: string;
}) {
  return (
    <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="mb-3" style={{ color }}>{icon}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--c-text)' }}>{value}</div>
      <div className="text-xs mt-1 font-medium" style={{ color: 'var(--c-text-2)' }}>{label}</div>
      {sub && (
        <div className="text-xs mt-0.5" style={{ color: subColor ?? 'var(--c-text-4)' }}>{sub}</div>
      )}
    </div>
  );
}

function MinutesRow({ label, count, of: total, color, hint }: {
  label: string; count: number; of: number; color: string; hint: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs flex-1" style={{ color: 'var(--c-text-2)' }}>
        {label} <span style={{ color: 'var(--c-text-4)' }}>— {hint}</span>
      </span>
      <span className="text-xs tabular-nums font-semibold" style={{ color }}>
        {count} <span className="font-normal" style={{ color: 'var(--c-text-4)' }}>({pct}%)</span>
      </span>
    </div>
  );
}

function BillingRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs flex-1" style={{ color: 'var(--c-text-2)' }}>{label}</span>
      <span className="text-xs tabular-nums font-semibold" style={{ color: count > 0 ? color : 'var(--c-text-4)' }}>
        {count}
      </span>
    </div>
  );
}
