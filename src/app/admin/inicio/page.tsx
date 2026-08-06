import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Terminal, PhoneCall,
  Users, DollarSign, Zap, CheckCircle2, Server,
} from 'lucide-react';
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
  approval_email:   string | null;
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

  // Inicio del mes actual (UTC) para el gasto Claude
  const monthStartIso = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();

  const [
    { data: agents },
    { data: callsToday },
    { data: callsYest },
    { data: inboxPending },
    { data: lastCallsPerAgent },
    { data: acctMinsData },
    { count: opsLogCount },
    { data: llmCostRows },
    approvalsPending,
    vapiAccount,
    twilioBalance,
  ] = await Promise.all([
    supabase.from('voice_agents')
      .select('id, business_name, active, billing_status, minutes_used, minutes_included, ai_ops_used, ai_ops_limit, portal_email, plan, minutes_plan, approval_email')
      .not('portal_email', 'in', demoExcl)
      .order('created_at', { ascending: false }),
    supabase.from('voice_calls')
      .select('id')
      .gte('created_at', todayIso),
    supabase.from('voice_calls')
      .select('id')
      .gte('created_at', yestIso)
      .lt('created_at', todayIso),
    // Solo 'escalated'. Se van al approval_email del empleado (email, no
    // hay bandeja UI en admin). La alerta solo avisa que revisen el correo.
    supabase.from('ops_inbox')
      .select('id, agent_id, created_at, email_from, email_subject, category, status')
      .eq('status', 'escalated')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('voice_calls')
      .select('agent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('account_minutes').select('portal_email, minutes_used, minutes_included'),
    supabase.from('ai_ops_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStartIso),
    // Real Claude spend del mes: suma cost_usd de llm_call_log (todas las llamadas
    // reales, no estimadas por tarea). Volumen esperado < 10K rows/mes; reduce en
    // JS es aceptable. Si crece, mover a RPC/vista materializada.
    supabase.from('llm_call_log')
      .select('cost_usd')
      .gte('created_at', monthStartIso),
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

  // Infra: Claude cost real del mes desde llm_call_log.
  // Cada llamada a anthropic.messages.create se loguea con tokens reales +
  // cost_usd calculado. Incluye CES eval, learn cron, golden tests, admin
  // chat, generate-kb, inbox-processor, delegate, consult, voz (customLLM),
  // etc. Fuente única de verdad, más precisa que estimado por tarea.
  const opsThisMonth      = opsLogCount ?? 0;
  const llmCallCount      = (llmCostRows ?? []).length;
  const actualClaudeCost  = (llmCostRows ?? []).reduce(
    (sum: number, r: { cost_usd: number | string | null }) => sum + Number(r.cost_usd ?? 0),
    0,
  );
  const claudeBudget      = parseFloat(process.env.CLAUDE_MONTHLY_BUDGET ?? '50');
  const claudeBudgetPct   = Math.min(Math.round((actualClaudeCost / claudeBudget) * 100), 100);
  const claudeOverBudget  = actualClaudeCost >= claudeBudget;
  const claudeNearBudget  = !claudeOverBudget && claudeBudgetPct >= 70;

  // Consolidated alerts (business + infra)
  interface AlertItem {
    severity: Severity;
    label:    string;
    sub:      string;
    href?:    string;  // opcional. Sin href = alerta informativa (no clickeable).
    count?:   number;
  }
  const alerts: AlertItem[] = [];

  // Detecta el proveedor de webmail por dominio del email destino.
  // Si no reconoce el dominio, devuelve null → alerta queda sin link.
  const inboxUrlFor = (email: string): string | null => {
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (domain === 'gmail.com' || domain === 'googlemail.com') return 'https://mail.google.com/mail/';
    if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'https://outlook.live.com/mail/';
    if (domain === 'yahoo.com' || domain.endsWith('.yahoo.com'))                 return 'https://mail.yahoo.com/';
    // Google Workspace / custom domain con MX de Google → asume Gmail (mayoría en LATAM)
    // Sin manera confiable de detectar, mejor no linkear.
    return null;
  };

  // Helper: link directo cuando hay 1 afectado, o link a búsqueda pre-filtrada cuando hay más.
  const clientLink = (a: AgentRow) => {
    const key = a.portal_email ?? a.business_name;
    return `/admin/clientes/${encodeURIComponent(key)}/editar`;
  };
  const agentLink = (a: AgentRow) => `/admin/agentes/${a.id}`;
  const searchLink = (query: string) => `/admin/clientes?search=${encodeURIComponent(query)}`;
  const nameList = (arr: AgentRow[]) =>
    arr.slice(0, 3).map(a => a.business_name).join(', ') + (arr.length > 3 ? `, +${arr.length - 3}` : '');

  const failedBilling = agentList.filter(a => a.billing_status === 'pago_fallido');
  if (failedBilling.length > 0) {
    alerts.push({
      severity: 'high',
      label:    failedBilling.length === 1
                  ? `Pago fallido: ${failedBilling[0].business_name}`
                  : `${failedBilling.length} clientes con pago fallido`,
      sub:      nameList(failedBilling),
      href:     failedBilling.length === 1
                  ? clientLink(failedBilling[0])
                  : '/admin/facturacion?tab=stripe',
      count:    failedBilling.length,
    });
  }

  const inboxEscalatedN = (inboxPending ?? []).length;
  if (inboxEscalatedN > 0) {
    // Escalated se envían al approval_email del agente vía correo. No hay
    // bandeja UI en admin. La alerta le dice al owner a qué email(s) revisar.
    const approvalEmailByAgent = new Map(agentList.map(a => [a.id, a.approval_email]));
    const emailsSet = new Set<string>();
    for (const i of (inboxPending ?? []) as { agent_id: string }[]) {
      const email = approvalEmailByAgent.get(i.agent_id);
      if (email) emailsSet.add(email);
    }
    const emails = [...emailsSet];
    const emailList = emails.slice(0, 3).join(', ') + (emails.length > 3 ? `, +${emails.length - 3}` : '');
    // Solo hay href si SÓLO hay 1 email destino Y su dominio es reconocido.
    // Con múltiples destinos no podemos abrir varias bandejas; queda informativa.
    const singleInboxUrl = emails.length === 1 ? inboxUrlFor(emails[0]) : null;
    alerts.push({
      severity: 'high',
      label:    emails.length === 0
                  ? `${inboxEscalatedN} correo${inboxEscalatedN > 1 ? 's' : ''} escalado${inboxEscalatedN > 1 ? 's' : ''}`
                  : emails.length === 1
                    ? `${inboxEscalatedN} correo${inboxEscalatedN > 1 ? 's' : ''} escalado${inboxEscalatedN > 1 ? 's' : ''} a ${emails[0]}`
                    : `${inboxEscalatedN} correo${inboxEscalatedN > 1 ? 's' : ''} escalado${inboxEscalatedN > 1 ? 's' : ''}`,
      sub:      emails.length > 1
                  ? `Revisar bandeja de: ${emailList}`
                  : singleInboxUrl
                    ? 'Abrir bandeja para responder'
                    : 'Revisar la bandeja del correo destino',
      ...(singleInboxUrl ? { href: singleInboxUrl } : {}),
      count:    inboxEscalatedN,
    });
  }

  if (approvalsPending > 0) {
    alerts.push({
      severity: 'high',
      label:    `${approvalsPending} ${approvalsPending === 1 ? 'acción' : 'acciones'} pendientes de aprobación`,
      sub:      'Grants, refunds y cambios destructivos',
      href:     '/admin/aprobaciones',
      count:    approvalsPending,
    });
  }

  if (vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD) {
    alerts.push({
      severity: 'high',
      label:    `Vapi con saldo bajo: $${vapiBalance.toFixed(2)} USD`,
      sub:      `Threshold ${VAPI_LOW_THRESHOLD} USD. Recarga en el dashboard Vapi.`,
      href:     'https://dashboard.vapi.ai/billing',
    });
  }

  if (twilioBalance2 !== null && twilioBalance2 < TWILIO_LOW_THRESHOLD) {
    alerts.push({
      severity: 'high',
      label:    `Twilio con saldo bajo: $${twilioBalance2.toFixed(2)} USD`,
      sub:      `Threshold ${TWILIO_LOW_THRESHOLD} USD. Recarga en el console Twilio.`,
      href:     'https://console.twilio.com/us1/billing',
    });
  }

  if (claudeOverBudget) {
    alerts.push({
      severity: 'high',
      label:    `Claude sobre presupuesto: $${actualClaudeCost.toFixed(2)} de $${claudeBudget} USD`,
      sub:      'Revisa uso real en console.anthropic.com',
      href:     'https://console.anthropic.com/settings/usage',
    });
  }

  const pctLabel = (used: number, included: number): string => {
    const raw = (used / included) * 100;
    if (raw > 100) {
      const over = Math.round(raw - 100);
      return `100% consumido, +${over}% en sobre-uso`;
    }
    return `${Math.round(raw)}%`;
  };

  const criticalMins = agentList.filter(a => a.active && a.minutes_included && (a.minutes_used ?? 0) / a.minutes_included >= 0.9);
  if (criticalMins.length > 0) {
    alerts.push({
      severity: 'med',
      label:    criticalMins.length === 1
                  ? `${criticalMins[0].business_name}: minutos ${pctLabel(criticalMins[0].minutes_used ?? 0, criticalMins[0].minutes_included!)}`
                  : `${criticalMins.length} clientes con minutos > 90%`,
      sub:      nameList(criticalMins),
      href:     criticalMins.length === 1 ? clientLink(criticalMins[0]) : searchLink(criticalMins[0].business_name),
      count:    criticalMins.length,
    });
  }

  const criticalOps = agentList.filter(a => a.active && a.ai_ops_limit && (a.ai_ops_used ?? 0) / a.ai_ops_limit >= 0.9);
  if (criticalOps.length > 0) {
    alerts.push({
      severity: 'med',
      label:    criticalOps.length === 1
                  ? `${criticalOps[0].business_name}: tareas ${pctLabel(criticalOps[0].ai_ops_used ?? 0, criticalOps[0].ai_ops_limit!)}`
                  : `${criticalOps.length} clientes con tareas > 90%`,
      sub:      nameList(criticalOps),
      href:     criticalOps.length === 1 ? clientLink(criticalOps[0]) : searchLink(criticalOps[0].business_name),
      count:    criticalOps.length,
    });
  }

  if (claudeNearBudget) {
    alerts.push({
      severity: 'med',
      label:    `Claude cerca del límite: $${actualClaudeCost.toFixed(2)} (${claudeBudgetPct}%)`,
      sub:      `Presupuesto mensual $${claudeBudget} USD. Revisa uso en Anthropic.`,
      href:     'https://console.anthropic.com/settings/usage',
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
      label:    silentAgents.length === 1
                  ? `${silentAgents[0].business_name}: sin llamadas 7d`
                  : `${silentAgents.length} empleados activos sin llamadas 7d`,
      sub:      nameList(silentAgents),
      href:     silentAgents.length === 1 ? agentLink(silentAgents[0]) : searchLink(silentAgents[0].business_name),
      count:    silentAgents.length,
    });
  }

  // Sort by severity (high -> med -> low)
  const sevRank: Record<Severity, number> = { high: 0, med: 1, low: 2 };
  alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  // ── Rollups: Salud de minutos + Estado de facturación ────────────────────
  // (traídos de /admin/dashboard viejo — rollup ejecutivo por-cuenta)
  const effMins = (a: AgentRow) => {
    const pool = a.portal_email ? acctMins.get(a.portal_email) : null;
    return pool
      ? { used: pool.minutes_used, included: pool.minutes_included }
      : { used: a.minutes_used ?? 0, included: a.minutes_included ?? 0 };
  };
  const healthAgents: { used: number; included: number }[] = [];
  const seenHealthAcct = new Set<string>();
  let totalRemaining = 0;
  for (const a of agentList) {
    if (!a.active) continue;
    const acctKey = a.portal_email ?? a.id;
    if (seenHealthAcct.has(acctKey)) continue;
    seenHealthAcct.add(acctKey);
    const m = effMins(a);
    if (m.included > 0) {
      healthAgents.push(m);
      totalRemaining += Math.max(0, m.included - m.used);
    }
  }
  const minsOk       = healthAgents.filter(m => (m.used / m.included) <  0.70).length;
  const minsWarning  = healthAgents.filter(m => { const p = m.used / m.included; return p >= 0.70 && p < 0.90; }).length;
  const minsCritical = healthAgents.filter(m => (m.used / m.included) >= 0.90).length;

  const billing = {
    activo:       agentList.filter(a => a.billing_status === 'activo').length,
    pago_fallido: agentList.filter(a => a.billing_status === 'pago_fallido').length,
    sin_plan:     agentList.filter(a => !a.billing_status || a.billing_status === 'sin_plan').length,
    cancelado:    agentList.filter(a => a.billing_status === 'cancelado').length,
  };

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
            {alerts.map((r, i) => {
              const isExternal = r.href?.startsWith('http');
              const body = (
                <>
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
                  {r.href && <ArrowRight size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
                </>
              );
              const baseClass = 'flex items-center gap-3 px-4 py-3 rounded-xl';
              const bgStyle   = { background: sevBg[r.severity], border: `1px solid ${sevBorder[r.severity]}` };

              // Sin href → alerta informativa, cursor default, sin hover
              if (!r.href) {
                return (
                  <div key={i} className={baseClass} style={bgStyle}>
                    {body}
                  </div>
                );
              }
              // Con href externo → <a target=_blank>
              if (isExternal) {
                return (
                  <a
                    key={i}
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${baseClass} transition-colors hover:brightness-95`}
                    style={bgStyle}
                  >
                    {body}
                  </a>
                );
              }
              // Con href interno → <Link>
              return (
                <Link
                  key={i}
                  href={r.href}
                  className={`${baseClass} transition-colors hover:brightness-95`}
                  style={bgStyle}
                >
                  {body}
                </Link>
              );
            })}
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
            value={`$${actualClaudeCost.toFixed(2)}`}
            unit="USD"
            danger={claudeOverBudget}
            warn={claudeNearBudget}
            hint={`${opsThisMonth.toLocaleString('es-MX')} tareas · ${llmCallCount.toLocaleString('es-MX')} llamadas Claude · ${claudeBudgetPct}% de $${claudeBudget}`}
            iconColor={claudeOverBudget ? '#EF4444' : claudeNearBudget ? '#F59E0B' : '#F59E0B'}
            iconBg={claudeOverBudget ? '#FEF2F2' : '#FFFBEB'}
          />
        </div>
      </section>

      {/* Rollups: Salud de minutos + Estado de facturación */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="rounded-xl bg-white px-6 py-5"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
              Salud de minutos
            </h2>
            <Link href="/admin/clientes" className="text-[12px] font-medium transition-colors hover:text-[#6C3BFF]" style={{ color: '#6B7280' }}>
              Ver clientes →
            </Link>
          </div>
          {healthAgents.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: '#9CA3AF' }}>Sin cuentas activas con plan de minutos</p>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                <MinutesRow label="OK"      count={minsOk}       of={healthAgents.length} color="#047857" hint="< 70% consumido" />
                <MinutesRow label="Alerta"  count={minsWarning}  of={healthAgents.length} color="#B45309" hint="70 a 90% consumido" />
                <MinutesRow label="Crítico" count={minsCritical} of={healthAgents.length} color="#B91C1C" hint="≥ 90% consumido" />
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

        <div
          className="rounded-xl bg-white px-6 py-5"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
              Estado de facturación
            </h2>
            <Link href="/admin/facturacion" className="text-[12px] font-medium transition-colors hover:text-[#6C3BFF]" style={{ color: '#6B7280' }}>
              Ver facturación →
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <BillingRow label="Al corriente"    count={billing.activo}       color="#047857" />
            <BillingRow label="Pago fallido"    count={billing.pago_fallido} color="#B91C1C" />
            <BillingRow label="Sin plan activo" count={billing.sin_plan}     color="#6B7280" />
            <BillingRow label="Cancelados"      count={billing.cancelado}    color="#374151" />
          </div>
          <div className="mt-5 pt-4 flex justify-between text-[12px]" style={{ borderTop: '1px solid #F3F4F6', color: '#6B7280' }}>
            <span>Total empleados registrados</span>
            <span className="font-semibold tabular-nums" style={{ color: '#111827' }}>{agentList.length}</span>
          </div>
        </div>
      </div>
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

