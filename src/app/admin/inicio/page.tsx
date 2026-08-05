import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Terminal, PhoneCall, Inbox,
  Users, DollarSign, Zap, CheckCircle2, Server, ShieldCheck,
} from 'lucide-react';
import LiveFeed from './LiveFeed';
import { pendingCount as pendingApprovalsCount } from '@/lib/admin/approvals';

export const dynamic = 'force-dynamic';

const DEMO_EMAILS = ['demo@centinelia.mx', 'centinelia.dev@gmail.com'];

interface AgentRow {
  id:               string;
  business_name:    string;
  active:           boolean;
  billing_status:   string | null;
  minutes_used:     number | null;
  minutes_included: number | null;
  ai_ops_used:      number | null;
  ai_ops_limit:     number | null;
  portal_email:     string | null;
  plan:             string | null;
  minutes_plan:     string | null;
}

interface CallRow {
  id:         string;
  agent_id:   string;
  created_at: string;
  outcome:    string | null;
  duration_seconds: number | null;
  summary:    string | null;
}

interface InboxRow {
  id:           string;
  agent_id:     string;
  created_at:   string;
  email_from:   string;
  email_subject: string;
  category:     string | null;
  status:       string;
}

type Severity = 'high' | 'med' | 'low';

export default async function InicioPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/inicio');
  }

  const supabase = createAdminClient();
  const now       = Date.now();
  const todayIso  = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const yestIso   = new Date(now - 86400000).toISOString();
  const weekIso   = new Date(now - 7 * 86400000).toISOString();

  const demoExcl = `(${DEMO_EMAILS.map(e => `"${e}"`).join(',')})`;

  const [
    { data: agents },
    { data: callsToday },
    { data: callsYest },
    { data: inboxPending },
    { data: recentCalls },
    { data: recentInbox },
    { data: lastCallsPerAgent },
    { data: acctMinsData },
    approvalsPending,
    vapiAccount,
    twilioBalance,
  ] = await Promise.all([
    supabase.from('voice_agents')
      .select('id, business_name, active, billing_status, minutes_used, minutes_included, ai_ops_used, ai_ops_limit, portal_email, plan, minutes_plan')
      .not('portal_email', 'in', demoExcl)
      .order('created_at', { ascending: false }),
    supabase.from('voice_calls')
      .select('id')
      .gte('created_at', todayIso),
    supabase.from('voice_calls')
      .select('id')
      .gte('created_at', yestIso)
      .lt('created_at', todayIso),
    supabase.from('ops_inbox')
      .select('id, agent_id, created_at, email_from, email_subject, category, status')
      .in('status', ['pending', 'escalated'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('voice_calls')
      .select('id, agent_id, created_at, outcome, duration_seconds, summary')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase.from('ops_inbox')
      .select('id, agent_id, created_at, email_from, email_subject, category, status')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase.from('voice_calls')
      .select('agent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('account_minutes').select('portal_email, minutes_used, minutes_included'),
    pendingApprovalsCount(),
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

  const agentList = (agents ?? []) as AgentRow[];
  const nameOf    = new Map(agentList.map(a => [a.id, a.business_name]));

  // Account minutes pool (for MRR / minutes health de-dupe)
  type AcctMin = { portal_email: string; minutes_used: number; minutes_included: number };
  const acctMins = new Map((acctMinsData ?? []).map((m: AcctMin) => [m.portal_email, m]));

  // North-star: llamadas HOY vs AYER
  const callsTodayN = (callsToday ?? []).length;
  const callsYestN  = (callsYest  ?? []).length;
  const callsDelta  = callsYestN > 0 ? Math.round(((callsTodayN - callsYestN) / callsYestN) * 100) : null;

  // KPIs
  const opsUsedTotal    = agentList.reduce((s, a) => s + (a.ai_ops_used  ?? 0), 0);
  const opsLimitTotal   = agentList.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
  const opsPct          = opsLimitTotal > 0 ? Math.round((opsUsedTotal / opsLimitTotal) * 100) : 0;

  const activeCount     = agentList.filter(a => a.active).length;

  // MRR — only agents with billing_status = 'activo' and a known minutes plan
  const mrr = agentList
    .filter(a => a.billing_status === 'activo' && a.plan && a.minutes_plan && a.minutes_plan !== 'enterprise')
    .reduce((sum, a) => {
      const cfg = MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier];
      return sum + (cfg?.mxn ?? 0);
    }, 0);

  // Infra: Vapi / Twilio balances
  const vapiBalance    = typeof vapiAccount?.balance   === 'number' ? vapiAccount.balance   : null;
  const twilioBalance2 = typeof twilioBalance?.balance === 'string' ? parseFloat(twilioBalance.balance) : null;
  const VAPI_LOW_THRESHOLD   = 20;  // USD
  const TWILIO_LOW_THRESHOLD = 10;  // USD

  // Infra: Claude estimated cost
  const estimatedClaudeCost = opsUsedTotal * 0.0024;
  const claudeBudget        = parseFloat(process.env.CLAUDE_MONTHLY_BUDGET ?? '50');
  const claudeBudgetPct     = Math.min(Math.round((estimatedClaudeCost / claudeBudget) * 100), 100);
  const claudeOverBudget    = estimatedClaudeCost >= claudeBudget;
  const claudeNearBudget    = !claudeOverBudget && claudeBudgetPct >= 70;

  // Consolidated alerts (business + infra)
  interface AlertItem {
    severity: Severity;
    label:    string;
    sub:      string;
    href:     string;
    count?:   number;
  }
  const alerts: AlertItem[] = [];

  const failedBilling = agentList.filter(a => a.billing_status === 'pago_fallido');
  if (failedBilling.length > 0) {
    alerts.push({
      severity: 'high',
      label:    'Pagos fallidos',
      sub:      failedBilling.map(a => a.business_name).slice(0, 3).join(', ') + (failedBilling.length > 3 ? `, +${failedBilling.length - 3}` : ''),
      href:     '/admin/billing',
      count:    failedBilling.length,
    });
  }

  const inboxPendingN = (inboxPending ?? []).length;
  if (inboxPendingN > 0) {
    alerts.push({
      severity: 'high',
      label:    'Correos esperando tu aprobación',
      sub:      'Bandeja de operaciones',
      href:     '/admin/inicio',
      count:    inboxPendingN,
    });
  }

  if (approvalsPending > 0) {
    alerts.push({
      severity: 'high',
      label:    'Acciones en el gate esperando aprobación',
      sub:      'Grants, refunds y cambios destructivos',
      href:     '/admin/aprobaciones',
      count:    approvalsPending,
    });
  }

  if (vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD) {
    alerts.push({
      severity: 'high',
      label:    'Vapi con saldo bajo',
      sub:      `$${vapiBalance.toFixed(2)} USD, recargar cuanto antes`,
      href:     'https://dashboard.vapi.ai/billing',
    });
  }

  if (twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD) {
    alerts.push({
      severity: 'high',
      label:    'Twilio con saldo bajo',
      sub:      `$${twilioBalance2.toFixed(2)} USD, recargar cuanto antes`,
      href:     'https://console.twilio.com/us1/billing',
    });
  }

  if (claudeOverBudget) {
    alerts.push({
      severity: 'high',
      label:    'Claude sobre presupuesto mensual',
      sub:      `~$${estimatedClaudeCost.toFixed(2)} de $${claudeBudget} USD`,
      href:     '/admin/ledger',
    });
  }

  const criticalMins = agentList.filter(a => a.active && a.minutes_included && (a.minutes_used ?? 0) / a.minutes_included >= 0.9);
  if (criticalMins.length > 0) {
    alerts.push({
      severity: 'med',
      label:    'Minutos sobre 90%',
      sub:      criticalMins.map(a => a.business_name).slice(0, 3).join(', ') + (criticalMins.length > 3 ? `, +${criticalMins.length - 3}` : ''),
      href:     '/admin/agentes',
      count:    criticalMins.length,
    });
  }

  const criticalOps = agentList.filter(a => a.active && a.ai_ops_limit && (a.ai_ops_used ?? 0) / a.ai_ops_limit >= 0.9);
  if (criticalOps.length > 0) {
    alerts.push({
      severity: 'med',
      label:    'Tareas sobre 90%',
      sub:      criticalOps.map(a => a.business_name).slice(0, 3).join(', ') + (criticalOps.length > 3 ? `, +${criticalOps.length - 3}` : ''),
      href:     '/admin/clientes',
      count:    criticalOps.length,
    });
  }

  if (claudeNearBudget) {
    alerts.push({
      severity: 'med',
      label:    'Claude cerca del límite mensual',
      sub:      `~$${estimatedClaudeCost.toFixed(2)} de $${claudeBudget} USD (${claudeBudgetPct}%)`,
      href:     '/admin/ledger',
    });
  }

  const lastCallMap = new Map<string, string>();
  for (const c of (lastCallsPerAgent ?? []) as { agent_id: string; created_at: string }[]) {
    if (!lastCallMap.has(c.agent_id)) lastCallMap.set(c.agent_id, c.created_at);
  }
  const silentAgents = agentList.filter(a => a.active && (!lastCallMap.get(a.id) || lastCallMap.get(a.id)! < weekIso));
  if (silentAgents.length > 0) {
    alerts.push({
      severity: 'low',
      label:    'Empleados activos sin llamadas 7d',
      sub:      silentAgents.map(a => a.business_name).slice(0, 3).join(', ') + (silentAgents.length > 3 ? `, +${silentAgents.length - 3}` : ''),
      href:     '/admin/agentes',
      count:    silentAgents.length,
    });
  }

  // Sort by severity (high -> med -> low)
  const sevRank: Record<Severity, number> = { high: 0, med: 1, low: 2 };
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  // Initial feed
  interface InitialEvent { id: string; ts: string; kind: string; actor: string; message: string; agentId?: string; status?: string }
  const initialFeed: InitialEvent[] = [];
  for (const c of (recentCalls ?? []) as CallRow[]) {
    const summary = c.summary?.trim().slice(0, 90);
    initialFeed.push({
      id:      `call_${c.id}`,
      ts:      c.created_at,
      kind:    'call',
      actor:   nameOf.get(c.agent_id) ?? 'empleado',
      message: summary ?? `Llamada. ${c.outcome ?? 'sin resultado'}. ${c.duration_seconds ?? 0}s`,
      agentId: c.agent_id,
      status:  c.outcome ?? undefined,
    });
  }
  for (const i of (recentInbox ?? []) as InboxRow[]) {
    initialFeed.push({
      id:      `inbox_${i.id}`,
      ts:      i.created_at,
      kind:    'email',
      actor:   nameOf.get(i.agent_id) ?? 'empleado',
      message: `${i.category ?? 'otro'} · ${i.status} · de ${i.email_from}: ${(i.email_subject ?? '(sin asunto)').slice(0, 60)}`,
      agentId: i.agent_id,
      status:  i.status,
    });
  }
  initialFeed.sort((a, b) => b.ts.localeCompare(a.ts));

  const sevColor: Record<Severity, string> = {
    high: '#EF4444',
    med:  '#F59E0B',
    low:  '#3B82F6',
  };
  const sevBg: Record<Severity, string> = {
    high: '#FEF2F2',
    med:  '#FFFBEB',
    low:  '#EFF6FF',
  };
  const sevBorder: Record<Severity, string> = {
    high: '#FECACA',
    med:  '#FDE68A',
    low:  '#BFDBFE',
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Inicio</h1>
          <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium"
          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
        >
          <Terminal size={13} />
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
          iconColor="#10B981"
          iconBg="#ECFDF5"
        />
        <KpiCard
          icon={<Users size={14} />}
          label="Empleados activos"
          value={String(activeCount)}
          sub={`de ${agentList.length} totales`}
          iconColor="#6C3BFF"
          iconBg="#F3F0FF"
        />
        <KpiCard
          icon={<PhoneCall size={14} />}
          label="Llamadas hoy"
          value={String(callsTodayN)}
          sub={callsDelta !== null ? `${callsDelta >= 0 ? '+' : ''}${callsDelta}% vs ayer` : 'sin datos ayer'}
          subColor={callsDelta === null ? '#9CA3AF' : callsDelta >= 0 ? '#10B981' : '#EF4444'}
          iconColor="#6C3BFF"
          iconBg="#F3F0FF"
        />
        <KpiCard
          icon={<Zap size={14} />}
          label="Tareas del mes"
          value={opsUsedTotal.toLocaleString('es-MX')}
          sub={`${opsPct}% de ${opsLimitTotal.toLocaleString('es-MX')}`}
          subColor={opsPct >= 90 ? '#EF4444' : opsPct >= 70 ? '#F59E0B' : '#10B981'}
          iconColor="#3B82F6"
          iconBg="#EFF6FF"
        />
      </div>

      {/* Consolidated alerts */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
          Alertas
        </h2>

        {alerts.length === 0 ? (
          <div
            className="flex items-center gap-3 px-5 py-4 rounded-xl"
            style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}
          >
            <CheckCircle2 size={18} style={{ color: '#10B981' }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>Todo tranquilo</p>
              <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>
                Sin acciones pendientes ni riesgos abiertos.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((r, i) => (
              <Link
                key={i}
                href={r.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:brightness-95"
                style={{ background: sevBg[r.severity], border: `1px solid ${sevBorder[r.severity]}` }}
              >
                <AlertTriangle size={15} style={{ color: sevColor[r.severity], flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>{r.label}</p>
                    {typeof r.count === 'number' && (
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums"
                        style={{ background: `${sevColor[r.severity]}14`, color: sevColor[r.severity], border: `1px solid ${sevColor[r.severity]}30` }}
                      >
                        {r.count}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B7280' }}>{r.sub}</p>
                </div>
                <ArrowRight size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Infra mini */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
          Infraestructura
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InfraMini
            icon={<Server size={15} />}
            label="Vapi, saldo"
            value={vapiBalance !== null ? `$${vapiBalance.toFixed(2)}` : 'No disponible'}
            unit={vapiBalance !== null ? 'USD' : undefined}
            danger={vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD}
            iconColor="#6C3BFF"
            iconBg="#F3F0FF"
          />
          <InfraMini
            icon={<Server size={15} />}
            label="Twilio, saldo"
            value={twilioBalance2 !== null ? `$${twilioBalance2.toFixed(2)}` : 'No disponible'}
            unit={twilioBalance2 !== null ? 'USD' : undefined}
            danger={twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD}
            iconColor="#EF4444"
            iconBg="#FEF2F2"
          />
          <InfraMini
            icon={<Zap size={15} />}
            label="Claude, gasto mensual"
            value={`~$${estimatedClaudeCost.toFixed(2)}`}
            unit="USD"
            danger={claudeOverBudget}
            warn={claudeNearBudget}
            hint={`${opsUsedTotal.toLocaleString('es-MX')} tareas de $${claudeBudget} (${claudeBudgetPct}%)`}
            iconColor={claudeOverBudget ? '#EF4444' : claudeNearBudget ? '#F59E0B' : '#F59E0B'}
            iconBg={claudeOverBudget ? '#FEF2F2' : '#FFFBEB'}
          />
        </div>
      </section>

      {/* Live feed */}
      <LiveFeed initial={initialFeed} />

      {/* Quick actions */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <QuickAction href="/admin/comando"        icon={<Terminal size={15} />}    label="Comando"      hint="terminal de operación" primary />
          <QuickAction href="/admin/ledger"         icon={<DollarSign size={15} />}  label="Ledger"       hint="revenue vs costo por empleado" />
          <QuickAction href="/admin/aprobaciones"   icon={<ShieldCheck size={15} />} label="Aprobaciones" hint={approvalsPending > 0 ? `${approvalsPending} pendiente${approvalsPending > 1 ? 's' : ''}` : 'gate limpio'} />
          <QuickAction href="/admin/agentes"        icon={<Users size={15} />}       label="Empleados"    hint={`${activeCount} activos`} />
          <QuickAction href="/admin/llamadas"       icon={<PhoneCall size={15} />}   label="Llamadas"     hint="historial completo" />
          <QuickAction href="/admin/analytics"      icon={<Zap size={15} />}         label="Analytics"    hint="métricas del mes" />
          <QuickAction href="/admin/conversacional" icon={<Inbox size={15} />}       label="Aprendizaje"  hint="learnings por revisar" />
        </div>
      </section>
    </div>
  );
}

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
      className="rounded-xl bg-white px-5 py-4 overflow-hidden"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>{label}</p>
      </div>
      <div className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{value}</div>
      {sub && (
        <div className="text-[12px] mt-2 font-medium" style={{ color: subColor ?? '#6B7280' }}>{sub}</div>
      )}
    </div>
  );
}

function InfraMini({ icon, label, value, unit, danger, warn, hint, iconColor, iconBg }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  danger?: boolean;
  warn?: boolean;
  hint?: string;
  iconColor: string;
  iconBg: string;
}) {
  const valueColor = danger ? '#EF4444' : '#111827';
  return (
    <div
      className="rounded-xl bg-white px-5 py-4 overflow-hidden"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>{label}</p>
      </div>
      <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: valueColor }}>
        {value}
        {unit && <span className="text-[13px] font-normal ml-1" style={{ color: '#6B7280' }}>{unit}</span>}
      </p>
      {hint && (
        <p className="text-[12px] mt-2" style={{ color: '#6B7280' }}>{hint}</p>
      )}
      {(danger || warn) && (
        <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: danger ? '#EF4444' : '#F59E0B' }}>
          <AlertTriangle size={11} />
          {danger ? 'Requiere atención' : 'Cerca del límite'}
        </p>
      )}
    </div>
  );
}

function QuickAction({ href, icon, label, hint, primary }: {
  href: string; icon: React.ReactNode; label: string; hint: string; primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 p-4 rounded-xl transition-colors hover:bg-gray-50"
      style={{
        background: primary ? '#F5F0FF' : '#FFFFFF',
        border:     primary ? '1px solid #DDD1FF' : '1px solid #E5E7EB',
        boxShadow:  '0 1px 3px 0 rgb(0 0 0 / 0.05)',
      }}
    >
      <span style={{ color: primary ? '#6C3BFF' : '#6B7280' }}>{icon}</span>
      <div>
        <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>{label}</p>
        <p className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{hint}</p>
      </div>
    </Link>
  );
}
