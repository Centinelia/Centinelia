import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Terminal, PhoneCall, Mail, Inbox,
  Users, DollarSign, Zap, CheckCircle2, Server,
} from 'lucide-react';
import LiveFeed from './LiveFeed';

export const dynamic = 'force-dynamic';

const ADMIN_COOKIE = 'Centinelia_admin';
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

export default async function InicioPage() {
  const c = await cookies();
  const admin = c.get(ADMIN_COOKIE)?.value;
  if (!admin || admin !== process.env.ADMIN_SECRET) {
    redirect('/admin/login?from=/admin/inicio');
  }

  const supabase = createAdminClient();
  const now       = Date.now();
  const todayIso  = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const yestIso   = new Date(now - 86400000).toISOString();
  const twoDayIso = new Date(now - 2 * 86400000).toISOString();
  const weekIso   = new Date(now - 7 * 86400000).toISOString();

  const demoExcl = `(${DEMO_EMAILS.map(e => `"${e}"`).join(',')})`;

  const [
    { data: agents },
    { data: callsToday },
    { data: callsYest },
    { data: inboxToday },
    { data: inboxPending },
    { data: recentCalls },
    { data: recentInbox },
    { data: lastCallsPerAgent },
  ] = await Promise.all([
    supabase.from('voice_agents')
      .select('id, business_name, active, billing_status, minutes_used, minutes_included, ai_ops_used, ai_ops_limit, portal_email')
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
      .select('id')
      .gte('created_at', todayIso),
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
  ]);

  const agentList = (agents ?? []) as AgentRow[];
  const nameOf    = new Map(agentList.map(a => [a.id, a.business_name]));

  // ── North-star: llamadas HOY vs AYER
  const callsTodayN = (callsToday ?? []).length;
  const callsYestN  = (callsYest  ?? []).length;
  const callsDelta  = callsYestN > 0 ? Math.round(((callsTodayN - callsYestN) / callsYestN) * 100) : null;

  // ── KPIs del día
  const inboxTodayN     = (inboxToday   ?? []).length;
  const opsUsedTotal    = agentList.reduce((s, a) => s + (a.ai_ops_used  ?? 0), 0);
  const opsLimitTotal   = agentList.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
  const opsPct          = opsLimitTotal > 0 ? Math.round((opsUsedTotal / opsLimitTotal) * 100) : 0;

  // ── Risk radar: agrupamos por severidad
  const riskItems: Array<{ severity: 'high' | 'med' | 'low'; label: string; sub: string; href: string; count: number }> = [];

  const failedBilling = agentList.filter(a => a.billing_status === 'pago_fallido');
  if (failedBilling.length > 0) {
    riskItems.push({
      severity: 'high',
      label:    'Pagos fallidos',
      sub:      failedBilling.map(a => a.business_name).slice(0, 3).join(', ') + (failedBilling.length > 3 ? `, +${failedBilling.length - 3}` : ''),
      href:     '/admin/billing',
      count:    failedBilling.length,
    });
  }

  const inboxPendingN = (inboxPending ?? []).length;
  if (inboxPendingN > 0) {
    riskItems.push({
      severity: 'high',
      label:    'Correos esperando tu aprobación',
      sub:      'Bandeja de operaciones',
      href:     '/admin/dashboard',   // TODO: dashboard de aprobaciones cuando lo tengamos
      count:    inboxPendingN,
    });
  }

  const criticalMins = agentList.filter(a => a.active && a.minutes_included && (a.minutes_used ?? 0) / a.minutes_included >= 0.9);
  if (criticalMins.length > 0) {
    riskItems.push({
      severity: 'med',
      label:    'Minutos > 90%',
      sub:      criticalMins.map(a => a.business_name).slice(0, 3).join(', ') + (criticalMins.length > 3 ? `, +${criticalMins.length - 3}` : ''),
      href:     '/admin/agentes',
      count:    criticalMins.length,
    });
  }

  const criticalOps = agentList.filter(a => a.active && a.ai_ops_limit && (a.ai_ops_used ?? 0) / a.ai_ops_limit >= 0.9);
  if (criticalOps.length > 0) {
    riskItems.push({
      severity: 'med',
      label:    'Ops > 90%',
      sub:      criticalOps.map(a => a.business_name).slice(0, 3).join(', ') + (criticalOps.length > 3 ? `, +${criticalOps.length - 3}` : ''),
      href:     '/admin/agentes',
      count:    criticalOps.length,
    });
  }

  // Agentes activos sin llamadas en 7 días
  const lastCallMap = new Map<string, string>();
  for (const c of (lastCallsPerAgent ?? []) as { agent_id: string; created_at: string }[]) {
    if (!lastCallMap.has(c.agent_id)) lastCallMap.set(c.agent_id, c.created_at);
  }
  const silentAgents = agentList.filter(a => a.active && (!lastCallMap.get(a.id) || lastCallMap.get(a.id)! < weekIso));
  if (silentAgents.length > 0) {
    riskItems.push({
      severity: 'low',
      label:    'Agentes activos sin llamadas 7d',
      sub:      silentAgents.map(a => a.business_name).slice(0, 3).join(', ') + (silentAgents.length > 3 ? `, +${silentAgents.length - 3}` : ''),
      href:     '/admin/agentes',
      count:    silentAgents.length,
    });
  }

  // ── Initial feed (server-rendered para el primer paint)
  interface InitialEvent { id: string; ts: string; kind: string; actor: string; message: string; agentId?: string; status?: string }
  const initialFeed: InitialEvent[] = [];
  for (const c of (recentCalls ?? []) as CallRow[]) {
    const summary = c.summary?.trim().slice(0, 90);
    initialFeed.push({
      id:      `call_${c.id}`,
      ts:      c.created_at,
      kind:    'call',
      actor:   nameOf.get(c.agent_id) ?? 'agente',
      message: summary ?? `Llamada · ${c.outcome ?? '—'} · ${c.duration_seconds ?? 0}s`,
      agentId: c.agent_id,
      status:  c.outcome ?? undefined,
    });
  }
  for (const i of (recentInbox ?? []) as InboxRow[]) {
    initialFeed.push({
      id:      `inbox_${i.id}`,
      ts:      i.created_at,
      kind:    'email',
      actor:   nameOf.get(i.agent_id) ?? 'agente',
      message: `${i.category ?? 'otro'} · ${i.status} · de ${i.email_from}: ${(i.email_subject ?? '(sin asunto)').slice(0, 60)}`,
      agentId: i.agent_id,
      status:  i.status,
    });
  }
  initialFeed.sort((a, b) => b.ts.localeCompare(a.ts));

  // ── Render
  const sevColor: Record<'high' | 'med' | 'low', string> = {
    high: '#ef4444',
    med:  '#f59e0b',
    low:  '#6b7280',
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl" style={{ background: '#120726', minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--c-text-4)' }}>
            Inicio
          </p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h1>
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

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1 — ¿Qué está pasando?                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--c-text-3)' }}>
          ¿Qué está pasando?
        </h2>

        {/* North-star + 3 KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-6">
          <div className="lg:col-span-2 p-5 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(108,59,255,0.15), rgba(155,109,255,0.08))', border: '1px solid rgba(155,109,255,0.25)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <PhoneCall size={14} style={{ color: '#9B6DFF' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>Llamadas hoy</p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums" style={{ color: '#fff', fontFamily: 'var(--font-sora)' }}>{callsTodayN}</span>
              {callsDelta !== null && (
                <span className="text-sm font-semibold tabular-nums" style={{ color: callsDelta >= 0 ? '#22c55e' : '#ef4444' }}>
                  {callsDelta >= 0 ? '+' : ''}{callsDelta}% vs ayer
                </span>
              )}
            </div>
          </div>

          <MiniKpi icon={<Mail size={14} />} label="Correos hoy" value={inboxTodayN} color="#3b82f6" />
          <MiniKpi
            icon={<Zap size={14} />}
            label="Ops del mes"
            value={opsUsedTotal.toLocaleString('es-MX')}
            sub={`${opsPct}% de ${opsLimitTotal.toLocaleString('es-MX')}`}
            color={opsPct >= 90 ? '#ef4444' : opsPct >= 70 ? '#f59e0b' : '#22c55e'}
          />
        </div>

        {/* Live feed */}
        <LiveFeed initial={initialFeed} />
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 2 — ¿Me necesita?                                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--c-text-3)' }}>
          ¿Me necesita?
        </h2>

        {riskItems.length === 0 ? (
          <div className="flex items-center gap-3 p-5 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#fff' }}>Todo tranquilo</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                Sin acciones pendientes ni riesgos abiertos.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {riskItems.map((r, i) => (
              <Link
                key={i}
                href={r.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-opacity hover:opacity-90"
                style={{ background: `${sevColor[r.severity]}0d`, border: `1px solid ${sevColor[r.severity]}30` }}
              >
                <AlertTriangle size={15} style={{ color: sevColor[r.severity], flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{r.label}</p>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${sevColor[r.severity]}25`, color: sevColor[r.severity] }}
                    >
                      {r.count}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>{r.sub}</p>
                </div>
                <ArrowRight size={14} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 3 — ¿Qué hago?                                             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mb-4">
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--c-text-3)' }}>
          ¿Qué hago?
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <QuickAction href="/admin/comando"    icon={<Terminal size={15} />}  label="Comando" hint="terminal de operación" primary />
          <QuickAction href="/admin/ledger"     icon={<DollarSign size={15} />} label="Ledger" hint="revenue vs costo por agente" />
          <QuickAction href="/admin/agentes"    icon={<Users size={15} />}     label="Agentes" hint={`${agentList.filter(a => a.active).length} activos`} />
          <QuickAction href="/admin/llamadas"   icon={<PhoneCall size={15} />} label="Llamadas" hint="historial completo" />
          <QuickAction href="/admin/billing"    icon={<DollarSign size={15} />} label="Billing" hint="pagos y planes" />
          <QuickAction href="/admin/analytics"  icon={<Zap size={15} />}       label="Analytics" hint="métricas del mes" />
          <QuickAction href="/admin/dashboard"  icon={<Server size={15} />}    label="Infra" hint="Vapi · Twilio · Claude" />
          <QuickAction href="/admin/conversacional" icon={<Inbox size={15} />} label="Aprendizaje" hint="learnings por revisar" />
          <QuickAction href="/admin/clientes"   icon={<Users size={15} />}     label="Clientes" hint="portales activos" />
        </div>
      </section>
    </div>
  );
}

function MiniKpi({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="p-5 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color }}>{icon}</span>
        <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>{sub}</p>}
    </div>
  );
}

function QuickAction({ href, icon, label, hint, primary }: {
  href: string; icon: React.ReactNode; label: string; hint: string; primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 p-4 rounded-xl transition-opacity hover:opacity-90"
      style={{
        background: primary
          ? 'linear-gradient(135deg, rgba(108,59,255,0.15), rgba(155,109,255,0.08))'
          : 'var(--c-surface)',
        border:     primary
          ? '1px solid rgba(155,109,255,0.25)'
          : '1px solid var(--c-border)',
      }}
    >
      <span style={{ color: primary ? '#9B6DFF' : 'var(--c-text-3)' }}>{icon}</span>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>{hint}</p>
      </div>
    </Link>
  );
}
