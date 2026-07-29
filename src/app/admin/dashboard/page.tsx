export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';
import {
  AlertTriangle, ArrowRight, DollarSign,
  Users, PhoneCall, UserPlus, Server, Zap, Terminal,
} from 'lucide-react';
import Link from 'next/link';

const DEMO_EMAILS = [
  'demo@centinelia.mx',
  'centinelia.dev@gmail.com',
];

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
    { data: acctMinsData },
    { data: opsData },
    vapiAccount,
    twilioBalance,
  ] = await Promise.all([
    supabase.from('voice_agents')
      .select('id, business_name, client_name, plan, minutes_plan, minutes_used, minutes_included, active, billing_status, created_at, portal_email')
      .neq('id', process.env.DEMO_AGENT_ID ?? '')
      .not('portal_email', 'in', `(${DEMO_EMAILS.join(',')})`)
      .order('created_at', { ascending: false }),
    supabase.from('voice_calls')
      .select('id, agent_id, created_at')
      .gte('created_at', since14d),
    supabase.from('voice_calls')
      .select('agent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase.from('account_minutes').select('portal_email, minutes_used, minutes_included'),
    supabase.from('voice_agents')
      .select('ai_ops_used, ai_ops_limit')
      .neq('id', process.env.DEMO_AGENT_ID ?? '')
      .not('portal_email', 'in', `(${DEMO_EMAILS.join(',')})`),
    fetch('https://api.vapi.ai/account', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      next:    { revalidate: 0 },
    }).then(r => r.ok ? r.json() : null).catch(() => null),
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Balance.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` }, next: { revalidate: 0 } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Infra stats
  type OpsStat = { ai_ops_used: number | null; ai_ops_limit: number | null };
  const totalOpsUsed  = (opsData ?? []).reduce((s: number, a: OpsStat) => s + (a.ai_ops_used  ?? 0), 0);
  const totalOpsLimit = (opsData ?? []).reduce((s: number, a: OpsStat) => s + (a.ai_ops_limit ?? 0), 0);
  // Estimated Claude cost: Haiku ~$0.0024 per op (1,500 input + 300 output tokens avg)
  const estimatedClaudeCost = totalOpsUsed * 0.0024;
  const claudeBudget        = parseFloat(process.env.CLAUDE_MONTHLY_BUDGET ?? '50');
  const claudeBudgetPct     = Math.min(Math.round((estimatedClaudeCost / claudeBudget) * 100), 100);
  const claudeOverBudget    = estimatedClaudeCost >= claudeBudget;
  const claudeNearBudget    = !claudeOverBudget && claudeBudgetPct >= 70;

  const vapiBalance   = typeof vapiAccount?.balance   === 'number' ? vapiAccount.balance   : null;
  const twilioBalance2 = typeof twilioBalance?.balance === 'string' ? parseFloat(twilioBalance.balance) : null;

  const VAPI_LOW_THRESHOLD   = 20;  // USD
  const TWILIO_LOW_THRESHOLD = 10;  // USD

  type AgentStat = { id: string; business_name: string; client_name: string; plan: string; minutes_plan: string | null; minutes_used: number; minutes_included: number; active: boolean; billing_status: string | null; created_at: string; portal_email: string | null };
  type CallStat  = { id: string; agent_id: string; created_at: string };
  type AcctMin   = { portal_email: string; minutes_used: number; minutes_included: number };

  const agents    = (agentsData ?? []) as AgentStat[];
  const calls     = (calls14d   ?? []) as CallStat[];
  const acctMins  = new Map((acctMinsData ?? []).map((m: AcctMin) => [m.portal_email, m]));
  const seenAcct  = new Set<string>(); // deduplicate account pools in aggregate stats

  // Resolve effective minutes for an agent (account pool or per-agent)
  const effMins = (a: AgentStat) => a.portal_email && acctMins.has(a.portal_email)
    ? acctMins.get(a.portal_email)!
    : { minutes_used: a.minutes_used, minutes_included: a.minutes_included };

  // MRR — only agents with billing_status = 'activo' and a known minutes plan
  const mrr = agents
    .filter(a => a.billing_status === 'activo' && a.plan && a.minutes_plan && a.minutes_plan !== 'enterprise')
    .reduce((sum: number, a: AgentStat) => {
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

  const alertedAccts = new Set<string>();
  for (const a of agents) {
    const m = effMins(a);
    // Deduplicate: only alert once per account pool
    const acctKey = a.portal_email ?? a.id;
    if (alertedAccts.has(acctKey)) continue;
    if (a.active && m.minutes_included > 0 && (m.minutes_used / m.minutes_included) >= 0.9) {
      alertedAccts.add(acctKey);
      const pct = Math.round((m.minutes_used / m.minutes_included) * 100);
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

  // Minutes health — deduplicate account pools so multi-agent accounts count once
  const healthAgents: { used: number; included: number }[] = [];
  const seenHealthAcct = new Set<string>();
  for (const a of agents) {
    if (!a.active) continue;
    const acctKey = a.portal_email ?? a.id;
    if (seenHealthAcct.has(acctKey)) continue;
    seenHealthAcct.add(acctKey);
    const m = effMins(a);
    if (m.minutes_included > 0) healthAgents.push({ used: m.minutes_used, included: m.minutes_included });
  }
  const minsOk         = healthAgents.filter(m => (m.used / m.included) <  0.70).length;
  const minsWarning    = healthAgents.filter(m => { const p = m.used / m.included; return p >= 0.70 && p < 0.90; }).length;
  const minsCritical   = healthAgents.filter(m => (m.used / m.included) >= 0.90).length;
  const withMinutes    = healthAgents;
  // Total remaining: sum across unique pools
  const seenRemAcct = new Set<string>();
  let totalRemaining = 0;
  for (const a of agents) {
    const acctKey = a.portal_email ?? a.id;
    if (seenRemAcct.has(acctKey)) continue;
    seenRemAcct.add(acctKey);
    const m = effMins(a);
    totalRemaining += Math.max(0, (m.minutes_included ?? 0) - (m.minutes_used ?? 0));
  }

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
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
        >
          <Terminal size={14} />
          Comando
        </Link>
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

      {/* Infra monitor */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--c-text-3)' }}>
          Infraestructura
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

          {/* Vapi */}
          <div className="p-4 rounded-xl flex items-start gap-3" style={{
            background: vapiBalance === null ? 'var(--c-surface)' : vapiBalance < VAPI_LOW_THRESHOLD ? 'rgba(239,68,68,0.06)' : 'var(--c-surface)',
            border:     vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--c-border)',
          }}>
            <Server size={15} style={{ color: vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD ? '#ef4444' : '#a855f7', flexShrink: 0, marginTop: 2 }} />
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Vapi — saldo</p>
              {vapiBalance !== null ? (
                <>
                  <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: vapiBalance < VAPI_LOW_THRESHOLD ? '#ef4444' : 'var(--c-text)' }}>
                    ${vapiBalance.toFixed(2)} USD
                  </p>
                  {vapiBalance < VAPI_LOW_THRESHOLD && (
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}>
                      <AlertTriangle size={10} /> Saldo bajo — recargar
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-4)' }}>No disponible</p>
              )}
            </div>
          </div>

          {/* Twilio */}
          <div className="p-4 rounded-xl flex items-start gap-3" style={{
            background: twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD ? 'rgba(239,68,68,0.06)' : 'var(--c-surface)',
            border:     twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--c-border)',
          }}>
            <Server size={15} style={{ color: twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD ? '#ef4444' : '#e11d48', flexShrink: 0, marginTop: 2 }} />
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Twilio — saldo</p>
              {twilioBalance2 !== null ? (
                <>
                  <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: twilioBalance2 < TWILIO_LOW_THRESHOLD ? '#ef4444' : 'var(--c-text)' }}>
                    ${twilioBalance2.toFixed(2)} USD
                  </p>
                  {twilioBalance2 < TWILIO_LOW_THRESHOLD && (
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}>
                      <AlertTriangle size={10} /> Saldo bajo — recargar
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-4)' }}>No disponible</p>
              )}
            </div>
          </div>

          {/* Claude / Ops */}
          <div className="p-4 rounded-xl flex items-start gap-3" style={{
            background: claudeOverBudget ? 'rgba(239,68,68,0.06)' : claudeNearBudget ? 'rgba(245,158,11,0.06)' : 'var(--c-surface)',
            border:     claudeOverBudget ? '1px solid rgba(239,68,68,0.3)' : claudeNearBudget ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--c-border)',
          }}>
            <Zap size={15} style={{ color: claudeOverBudget ? '#ef4444' : claudeNearBudget ? '#f59e0b' : '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Claude — gasto mensual</p>
              <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: claudeOverBudget ? '#ef4444' : 'var(--c-text)' }}>
                ~${estimatedClaudeCost.toFixed(2)}
                <span className="text-sm font-normal ml-1" style={{ color: 'var(--c-text-3)' }}>USD</span>
              </p>
              {/* Budget progress bar */}
              <div style={{ background: 'rgba(255,255,255,0.10)', borderRadius: 4, height: 4, overflow: 'hidden', margin: '8px 0 4px' }}>
                <div style={{
                  height: '100%',
                  width:  `${claudeBudgetPct}%`,
                  background: claudeOverBudget ? '#ef4444' : claudeNearBudget ? '#f59e0b' : '#a855f7',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                {totalOpsUsed.toLocaleString('es-MX')} ops · presupuesto ${claudeBudget} USD ({claudeBudgetPct}%)
              </p>
              {(claudeOverBudget || claudeNearBudget) && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: claudeOverBudget ? '#ef4444' : '#f59e0b' }}>
                  <AlertTriangle size={10} />
                  {claudeOverBudget ? 'Presupuesto superado' : 'Cerca del límite mensual'}
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

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
