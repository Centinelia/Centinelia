import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Terminal, PhoneCall, Mail, Inbox,
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
    { data: inboxToday },
    { data: inboxPending },
    { data: recentCalls },
    { data: recentInbox },
    { data: lastCallsPerAgent },
    approvalsPending,
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
    pendingApprovalsCount(),
  ]);

  const agentList = (agents ?? []) as AgentRow[];
  const nameOf    = new Map(agentList.map(a => [a.id, a.business_name]));

  // North-star: llamadas HOY vs AYER
  const callsTodayN = (callsToday ?? []).length;
  const callsYestN  = (callsYest  ?? []).length;
  const callsDelta  = callsYestN > 0 ? Math.round(((callsTodayN - callsYestN) / callsYestN) * 100) : null;

  // KPIs del día
  const inboxTodayN     = (inboxToday   ?? []).length;
  const opsUsedTotal    = agentList.reduce((s, a) => s + (a.ai_ops_used  ?? 0), 0);
  const opsLimitTotal   = agentList.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
  const opsPct          = opsLimitTotal > 0 ? Math.round((opsUsedTotal / opsLimitTotal) * 100) : 0;

  // Risk radar
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
      href:     '/admin/dashboard',
      count:    inboxPendingN,
    });
  }

  if (approvalsPending > 0) {
    riskItems.push({
      severity: 'high',
      label:    'Acciones en el gate esperando aprobación',
      sub:      'Grants, refunds y cambios destructivos',
      href:     '/admin/aprobaciones',
      count:    approvalsPending,
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

  const lastCallMap = new Map<string, string>();
  for (const c of (lastCallsPerAgent ?? []) as { agent_id: string; created_at: string }[]) {
    if (!lastCallMap.has(c.agent_id)) lastCallMap.set(c.agent_id, c.created_at);
  }
  const silentAgents = agentList.filter(a => a.active && (!lastCallMap.get(a.id) || lastCallMap.get(a.id)! < weekIso));
  if (silentAgents.length > 0) {
    riskItems.push({
      severity: 'low',
      label:    'Empleados activos sin llamadas 7d',
      sub:      silentAgents.map(a => a.business_name).slice(0, 3).join(', ') + (silentAgents.length > 3 ? `, +${silentAgents.length - 3}` : ''),
      href:     '/admin/agentes',
      count:    silentAgents.length,
    });
  }

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

  const sevColor: Record<'high' | 'med' | 'low', string> = {
    high: '#EF4444',
    med:  '#F59E0B',
    low:  '#6B7280',
  };
  const sevBg: Record<'high' | 'med' | 'low', string> = {
    high: '#FEF2F2',
    med:  '#FFFBEB',
    low:  '#F9FAFB',
  };
  const sevBorder: Record<'high' | 'med' | 'low', string> = {
    high: '#FECACA',
    med:  '#FDE68A',
    low:  '#E5E7EB',
  };

  const activeCount = agentList.filter(a => a.active).length;

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

      {/* SECTION 1 — ¿Qué está pasando? */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
          ¿Qué está pasando?
        </h2>

        {/* North-star + 3 KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div
            className="lg:col-span-2 rounded-xl bg-white px-5 py-4"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <PhoneCall size={13} style={{ color: '#8B5CF6' }} />
              <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>Llamadas hoy</p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{callsTodayN}</span>
              {callsDelta !== null && (
                <span className="text-[13px] font-medium tabular-nums" style={{ color: callsDelta >= 0 ? '#10B981' : '#EF4444' }}>
                  {callsDelta >= 0 ? '+' : ''}{callsDelta}% vs ayer
                </span>
              )}
            </div>
          </div>

          <MiniKpi icon={<Mail size={13} />} label="Correos hoy" value={inboxTodayN} color="#3B82F6" />
          <MiniKpi
            icon={<Zap size={13} />}
            label="Ops del mes"
            value={opsUsedTotal.toLocaleString('es-MX')}
            sub={`${opsPct}% de ${opsLimitTotal.toLocaleString('es-MX')}`}
            color={opsPct >= 90 ? '#EF4444' : opsPct >= 70 ? '#F59E0B' : '#10B981'}
          />
        </div>

        {/* Live feed */}
        <LiveFeed initial={initialFeed} />
      </section>

      {/* SECTION 2 — ¿Me necesita? */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
          ¿Me necesita?
        </h2>

        {riskItems.length === 0 ? (
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
            {riskItems.map((r, i) => (
              <Link
                key={i}
                href={r.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-gray-50"
                style={{ background: sevBg[r.severity], border: `1px solid ${sevBorder[r.severity]}` }}
              >
                <AlertTriangle size={15} style={{ color: sevColor[r.severity], flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>{r.label}</p>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums"
                      style={{ background: `${sevColor[r.severity]}14`, color: sevColor[r.severity], border: `1px solid ${sevColor[r.severity]}30` }}
                    >
                      {r.count}
                    </span>
                  </div>
                  <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B7280' }}>{r.sub}</p>
                </div>
                <ArrowRight size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 3 — ¿Qué hago? */}
      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
          ¿Qué hago?
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <QuickAction href="/admin/comando"      icon={<Terminal size={15} />}    label="Comando"    hint="terminal de operación" primary />
          <QuickAction href="/admin/ledger"       icon={<DollarSign size={15} />}  label="Ledger"     hint="revenue vs costo por empleado" />
          <QuickAction href="/admin/aprobaciones" icon={<ShieldCheck size={15} />} label="Aprobaciones" hint={approvalsPending > 0 ? `${approvalsPending} pendiente${approvalsPending > 1 ? 's' : ''}` : 'gate limpio'} />
          <QuickAction href="/admin/agentes"      icon={<Users size={15} />}       label="Empleados"  hint={`${activeCount} activos`} />
          <QuickAction href="/admin/llamadas"     icon={<PhoneCall size={15} />}   label="Llamadas"   hint="historial completo" />
          <QuickAction href="/admin/billing"      icon={<DollarSign size={15} />}  label="Billing"    hint="pagos y planes" />
          <QuickAction href="/admin/analytics"    icon={<Zap size={15} />}         label="Analytics"  hint="métricas del mes" />
          <QuickAction href="/admin/dashboard"    icon={<Server size={15} />}      label="Infra"      hint="Vapi, Twilio, Claude" />
          <QuickAction href="/admin/conversacional" icon={<Inbox size={15} />}     label="Aprendizaje" hint="learnings por revisar" />
        </div>
      </section>
    </div>
  );
}

function MiniKpi({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      </div>
      <p className="text-[28px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{value}</p>
      {sub && <p className="text-[12px] mt-1" style={{ color: '#6B7280' }}>{sub}</p>}
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
