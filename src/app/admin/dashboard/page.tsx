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
  type Alert = { priority: number; label: string; sub: string; href: string; color: string; bg: string; border: string };
  const alerts: Alert[] = [];

  for (const a of agents) {
    if (a.billing_status === 'pago_fallido') {
      alerts.push({
        priority: 0,
        label: a.business_name,
        sub: 'Pago fallido, contactar cliente',
        href: '/admin/billing',
        color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA',
      });
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
      alerts.push({
        priority: 1,
        label: a.business_name,
        sub: `${pct}% de minutos consumidos, ofrecer recarga`,
        href: `/admin/agentes/${a.id}`,
        color: '#B45309', bg: '#FFFBEB', border: '#FDE68A',
      });
    }
  }

  const sevenDaysAgo = new Date(now - 7 * 86400000);
  for (const a of agents) {
    if (!a.active) continue;
    const last = lastCallMap[a.id];
    if (!last || last < sevenDaysAgo) {
      const days = last ? Math.floor((now - last.getTime()) / 86400000) : null;
      const sub  = days === null ? 'Sin llamadas registradas.' : `Sin llamadas hace ${days} días.`;
      alerts.push({
        priority: 2,
        label: a.business_name,
        sub,
        href: `/admin/agentes/${a.id}`,
        color: '#4B5563', bg: '#F9FAFB', border: '#E5E7EB',
      });
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
  const trendColor = callsDelta === null ? '#9CA3AF' : callsDelta >= 0 ? '#047857' : '#B91C1C';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Infra</h1>
          <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
        >
          <Terminal size={14} />
          Comando
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<DollarSign size={14} />}
          label="MRR estimado"
          value={`$${mrr.toLocaleString('es-MX')}`}
          sub="MXN / mes"
          iconColor="#047857"
          iconBg="#ECFDF5"
        />
        <KpiCard
          icon={<Users size={14} />}
          label="Agentes activos"
          value={String(activeCount)}
          sub={`de ${agents.length} totales`}
          iconColor="#6C3BFF"
          iconBg="#F3F0FF"
        />
        <KpiCard
          icon={<PhoneCall size={14} />}
          label="Llamadas esta semana"
          value={String(callsThisWeek)}
          sub={trendSub}
          subColor={trendColor}
          iconColor="#8B5CF6"
          iconBg="#F3F0FF"
        />
        <KpiCard
          icon={<UserPlus size={14} />}
          label="Nuevos clientes"
          value={String(newThisMonth)}
          sub="este mes"
          iconColor="#2563EB"
          iconBg="#EFF6FF"
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-wider font-medium mb-3" style={{ color: '#9CA3AF' }}>
            Acción requerida
          </h2>
          <div className="flex flex-col gap-2">
            {alerts.map((alert, i) => (
              <Link
                key={i}
                href={alert.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:brightness-95"
                style={{ background: alert.bg, border: `1px solid ${alert.border}` }}
              >
                <AlertTriangle size={14} style={{ color: alert.color, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium leading-none" style={{ color: '#111827' }}>{alert.label}</p>
                  <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{alert.sub}</p>
                </div>
                <ArrowRight size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Infra monitor */}
      <section>
        <h2 className="text-[11px] uppercase tracking-wider font-medium mb-3" style={{ color: '#9CA3AF' }}>
          Infraestructura
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Vapi */}
          <InfraCard
            icon={<Server size={15} />}
            label="Vapi, saldo"
            valueEl={
              vapiBalance !== null ? (
                <p className="text-[24px] font-semibold leading-none tabular-nums mt-1" style={{ color: vapiBalance < VAPI_LOW_THRESHOLD ? '#B91C1C' : '#111827' }}>
                  ${vapiBalance.toFixed(2)}
                  <span className="text-[13px] font-normal ml-1" style={{ color: '#6B7280' }}>USD</span>
                </p>
              ) : (
                <p className="text-[13px] mt-1" style={{ color: '#9CA3AF' }}>No disponible</p>
              )
            }
            alertMsg={vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD ? 'Saldo bajo, recargar' : null}
            alertTone="danger"
            iconColor={vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD ? '#B91C1C' : '#8B5CF6'}
            iconBg={vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD ? '#FEF2F2' : '#F3F0FF'}
          />

          {/* Twilio */}
          <InfraCard
            icon={<Server size={15} />}
            label="Twilio, saldo"
            valueEl={
              twilioBalance2 !== null ? (
                <p className="text-[24px] font-semibold leading-none tabular-nums mt-1" style={{ color: twilioBalance2 < TWILIO_LOW_THRESHOLD ? '#B91C1C' : '#111827' }}>
                  ${twilioBalance2.toFixed(2)}
                  <span className="text-[13px] font-normal ml-1" style={{ color: '#6B7280' }}>USD</span>
                </p>
              ) : (
                <p className="text-[13px] mt-1" style={{ color: '#9CA3AF' }}>No disponible</p>
              )
            }
            alertMsg={twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD ? 'Saldo bajo, recargar' : null}
            alertTone="danger"
            iconColor={twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD ? '#B91C1C' : '#E11D48'}
            iconBg={twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD ? '#FEF2F2' : '#FEF2F2'}
          />

          {/* Claude / Ops */}
          <div
            className="rounded-xl bg-white px-5 py-4"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
                style={{
                  background: claudeOverBudget ? '#FEF2F2' : claudeNearBudget ? '#FFFBEB' : '#FFFBEB',
                  color: claudeOverBudget ? '#B91C1C' : claudeNearBudget ? '#B45309' : '#B45309',
                }}
              >
                <Zap size={15} />
              </span>
              <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>Claude, gasto mensual</p>
            </div>
            <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: claudeOverBudget ? '#B91C1C' : '#111827' }}>
              ~${estimatedClaudeCost.toFixed(2)}
              <span className="text-[13px] font-normal ml-1" style={{ color: '#6B7280' }}>USD</span>
            </p>
            {/* Budget progress bar */}
            <div className="mt-3" style={{ background: '#F3F4F6', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width:  `${claudeBudgetPct}%`,
                background: claudeOverBudget ? '#EF4444' : claudeNearBudget ? '#F59E0B' : '#8B5CF6',
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <p className="text-[12px] mt-2" style={{ color: '#6B7280' }}>
              {totalOpsUsed.toLocaleString('es-MX')} tareas · presupuesto ${claudeBudget} USD ({claudeBudgetPct}%)
            </p>
            {(claudeOverBudget || claudeNearBudget) && (
              <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: claudeOverBudget ? '#B91C1C' : '#B45309' }}>
                <AlertTriangle size={11} />
                {claudeOverBudget ? 'Presupuesto superado' : 'Cerca del límite mensual'}
              </p>
            )}
          </div>

        </div>
      </section>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Minutes Health */}
        <div
          className="rounded-xl bg-white px-6 py-5"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
              Salud de minutos
            </h2>
            <Link href="/admin/agentes" className="text-[12px] font-medium transition-colors hover:text-[#6C3BFF]" style={{ color: '#6B7280' }}>
              Ver agentes →
            </Link>
          </div>

          {withMinutes.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: '#9CA3AF' }}>Sin agentes activos con plan de minutos</p>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                <MinutesRow label="OK"       count={minsOk}       of={withMinutes.length} color="#047857" hint="< 70% consumido" />
                <MinutesRow label="Alerta"   count={minsWarning}  of={withMinutes.length} color="#B45309" hint="70 a 90% consumido" />
                <MinutesRow label="Crítico"  count={minsCritical} of={withMinutes.length} color="#B91C1C" hint="≥ 90% consumido" />
              </div>
              <div className="mt-5 pt-4 flex justify-between text-[12px]" style={{ borderTop: '1px solid #F3F4F6', color: '#6B7280' }}>
                <span>Minutos disponibles total</span>
                <span className="font-semibold tabular-nums" style={{ color: '#111827' }}>
                  {totalRemaining.toLocaleString('es-MX')} min
                </span>
              </div>
            </>
          )}
        </div>

        {/* Billing Summary */}
        <div
          className="rounded-xl bg-white px-6 py-5"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
              Estado de facturación
            </h2>
            <Link href="/admin/billing" className="text-[12px] font-medium transition-colors hover:text-[#6C3BFF]" style={{ color: '#6B7280' }}>
              Ver billing →
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <BillingRow label="Al corriente"    count={billing.activo}       color="#047857" />
            <BillingRow label="Pago fallido"    count={billing.pago_fallido} color="#B91C1C" />
            <BillingRow label="Sin plan activo" count={billing.sin_plan}     color="#6B7280" />
            <BillingRow label="Cancelados"      count={billing.cancelado}    color="#374151" />
          </div>
          <div className="mt-5 pt-4 flex justify-between text-[12px]" style={{ borderTop: '1px solid #F3F4F6', color: '#6B7280' }}>
            <span>Total agentes registrados</span>
            <span className="font-semibold tabular-nums" style={{ color: '#111827' }}>{agents.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, iconColor, iconBg, subColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  iconColor: string;
  iconBg: string;
  subColor?: string;
}) {
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      </div>
      <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{value}</div>
      {sub && (
        <div className="text-[12px] mt-2 font-medium" style={{ color: subColor ?? '#6B7280' }}>{sub}</div>
      )}
    </div>
  );
}

function InfraCard({ icon, label, valueEl, alertMsg, alertTone, iconColor, iconBg }: {
  icon: React.ReactNode;
  label: string;
  valueEl: React.ReactNode;
  alertMsg: string | null;
  alertTone: 'danger' | 'warn';
  iconColor: string;
  iconBg: string;
}) {
  const alertColor = alertTone === 'danger' ? '#B91C1C' : '#B45309';
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      </div>
      {valueEl}
      {alertMsg && (
        <p className="text-[12px] mt-2 flex items-center gap-1" style={{ color: alertColor }}>
          <AlertTriangle size={11} />
          {alertMsg}
        </p>
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
      <span className="text-[13px] flex-1" style={{ color: '#374151' }}>
        {label} <span style={{ color: '#9CA3AF' }}>· {hint}</span>
      </span>
      <span className="text-[13px] tabular-nums font-semibold" style={{ color }}>
        {count} <span className="font-normal" style={{ color: '#9CA3AF' }}>({pct}%)</span>
      </span>
    </div>
  );
}

function BillingRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-[13px] flex-1" style={{ color: '#374151' }}>{label}</span>
      <span className="text-[13px] tabular-nums font-semibold" style={{ color: count > 0 ? color : '#9CA3AF' }}>
        {count}
      </span>
    </div>
  );
}
