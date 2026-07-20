export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, CheckCircle, XCircle, PhoneCall, PhoneOutgoing, Users, ShoppingBag, CalendarDays, MessageCircle, AlertTriangle, ChevronRight, Clock, Zap } from 'lucide-react';
import { MonthReportPicker } from './MonthReportPicker';
import type { BusinessHours, Plan } from '@/types/agent';
// Phone, CheckCircle, XCircle still used in Agentes tab and alerts
import type { VoiceCall } from '@/types/agent';
import { MINUTES_TIER_CONFIG } from '@/lib/billing/plans';
import type { MinutesTier } from '@/lib/billing/plans';
import { ThemeProvider } from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { redirect } from 'next/navigation';

import PortalLogout            from './PortalLogout';
import BrandKitEditor          from './BrandKitEditor';
import BusinessSwitcher        from './BusinessSwitcher';
import PortalLeadsSection      from './PortalLeadsSection';
import PortalOrdersSection     from './PortalOrdersSection';
import PortalAppointmentsSection from './PortalAppointmentsSection';
import BuyMinutesSection       from './BuyMinutesSection';
import UpgradePlanSection      from './UpgradePlanSection';
import MinutesLedgerSection    from './MinutesLedgerSection';
import CallCard                from './CallCard';
import DownloadCallsCSV        from './DownloadCallsCSV';
import ContractSection         from './ContractSection';
import CollapsibleSection      from './CollapsibleSection';
import PeakHoursChart          from './PeakHoursChart';
import NotificationBell        from './NotificationBell';
import PortalFooter            from './PortalFooter';

import CallsSearch             from './CallsSearch';
import PortalTabNav           from './PortalTabNav';
import PortalSidebar          from './PortalSidebar';
import KnowledgeBaseEditor    from './KnowledgeBaseEditor';
import OwnerProfileEditor     from './OwnerProfileEditor';
import WebsiteSyncButton      from './WebsiteSyncButton';
import ReviewLinkEditor       from './ReviewLinkEditor';
import BusinessHoursEditor    from './BusinessHoursEditor';
import PortalOutboundSection     from './PortalOutboundSection';
import PortalContactsSection     from './PortalContactsSection';
import OutboundSection           from './OutboundSection';
import OutboundToggles           from './OutboundToggles';
import AutoRefillSection         from './AutoRefillSection';
import { inboxAddressFor }       from '@/lib/email/inbox';
import IntegrationsHub           from './IntegrationsHub';
import PoliciesSection          from './PoliciesSection';
import OrgCard                  from './OrgCard';
import InfoTooltip              from '@/components/InfoTooltip';
import type { OutboundCall }     from './PortalOutboundSection';
import type { ContactVoiceLead, ContactWALead, ContactOutbound } from './PortalContactsSection';

type Tab = 'inicio' | 'llamadas' | 'salientes' | 'oficina' | 'agentes' | 'negocio' | 'integraciones' | 'cuenta';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string; period?: string }>;
}


const FEED_OUTCOME: Record<string, { label: string; color: string; bg: string }> = {
  lead_created:       { label: 'Lead',       color: '#6C3BFF', bg: 'rgba(108,59,255,0.1)'   },
  appointment_booked: { label: 'Cita',       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'   },
  order_taken:        { label: 'Pedido',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'   },
  transferred:        { label: 'Transfer.',  color: '#a855f7', bg: 'rgba(168,85,247,0.1)'   },
  info_provided:      { label: 'Info',       color: '#6b7280', bg: 'rgba(107,114,128,0.1)'  },
  escalated_whatsapp: { label: 'WhatsApp',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)'    },
  unanswered:         { label: 'Sin resp.',  color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
  missed:             { label: 'Perdida',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)'    },
  other:              { label: 'Completada', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
};
const FEED_TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  lead:  { label: 'Lead',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)'  },
  order: { label: 'Pedido', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  appt:  { label: 'Cita',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
};

export default async function ClientPortalPage({ params, searchParams }: Props) {
  const { token }          = await params;
  const { tab: tabParam, period } = await searchParams;
  const tab: Tab           = (tabParam as Tab) ?? 'inicio';
  const days               = period ? parseInt(period) : undefined;

  if (tab === 'oficina')   redirect(`/portal/${token}/oficina`);
  if (tab === 'agentes')   redirect(`/portal/${token}/agentes`);
  if (tab === 'llamadas' || tab === 'salientes') redirect(`/portal/${token}/llamadas`);

  // ── Auth: verify session owns this portal ─────────────────────────────────
  const cookieStore    = await cookies();
  const sessionCookie  = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session        = await verifySession(sessionCookie);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('portal_token', token).single();
  if (!agent) notFound();

  // Security: verify this agent belongs to the logged-in client
  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail) {
    redirect('/portal/login');
  }

  const isOwner  = !session?.isSubUser;
  const modules  = session?.isSubUser ? (session.modules ?? []) : undefined;

  // New accounts must complete alignment setup before accessing the portal
  if (isOwner && (agent as any).onboarding_completed === false) {
    redirect(`/setup/${token}`);
  }

  // All agents for this client (same portal_email)
  // In dev the middleware bypasses auth so session is null — fall back to the agent's own email
  const lookupEmail = session?.portalEmail ?? (agent as any).portal_email ?? null;
  const { data: clientAgents } = lookupEmail
    ? await supabase
        .from('voice_agents')
        .select('id, business_name, agent_name, portal_token, active, client_paused, billing_status, plan, phone_number, logo_url, features, outbound_role, role, stripe_customer_id')
        .eq('portal_email', lookupEmail)
    : { data: [] };
  const allClientAgents = clientAgents ?? [];

  // Agents with outbound calling enabled — available to select when scheduling
  const outboundAgents = allClientAgents
    .filter(a => {
      const f = (a as any).features ?? {};
      return !!f.outbound_calls;
    })
    .map(a => ({
      token: a.portal_token,
      name:  (a.agent_name?.trim() || 'Centinelia'),
      role:  (a as any).outbound_role ?? undefined,
    }));

  // Group agents by business
  type BusinessGroup = { business_name: string; logo_url: string | null; first_token: string; agents: typeof allClientAgents };
  const businessGroups: BusinessGroup[] = [];
  const bySeen = new Map<string, BusinessGroup>();
  for (const a of allClientAgents) {
    if (!bySeen.has(a.business_name)) {
      const g: BusinessGroup = { business_name: a.business_name, logo_url: (a as any).logo_url ?? null, first_token: a.portal_token, agents: [] };
      bySeen.set(a.business_name, g);
      businessGroups.push(g);
    }
    bySeen.get(a.business_name)!.agents.push(a);
  }

  const clientPaused  = (agent as any).client_paused ?? false;
  const billingPaused = !agent.active && agent.billing_status === 'pago_fallido';

  const features      = agent.features ?? {};
  const showLeads     = !!features.lead_qualification;
  const showOrders    = !!features.order_taking;
  const showAppts     = !!features.appointment_booking;
  const showOutbound  = !!features.outbound_calls;
  const hasStripe     = !!agent.stripe_customer_id;
  const agentName  = agent.agent_name?.trim() || 'Centinelia';

  // Minutes: account-level pool when portal_email exists, per-agent for demo/standalone
  const { data: acctMins } = agent.portal_email
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included, minutes_reset_date').eq('portal_email', agent.portal_email).single()
    : { data: null };

  const minutesIncluded = acctMins?.minutes_included ?? agent.minutes_included ?? 0;
  const minutesUsed     = acctMins?.minutes_used     ?? agent.minutes_used     ?? 0;
  const minutesResetDate = acctMins?.minutes_reset_date ?? agent.minutes_reset_date ?? null;

  const minutesPct      = minutesIncluded > 0 ? Math.min((minutesUsed / minutesIncluded) * 100, 100) : 0;
  const minutesColor    = minutesPct > 90 ? '#ef4444' : minutesPct > 70 ? '#f59e0b' : '#22c55e';
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);
  const planBaseMinutes = agent.minutes_plan ? (MINUTES_TIER_CONFIG[agent.minutes_plan as MinutesTier]?.minutes ?? minutesIncluded) : minutesIncluded;
  const rolloverMinutes = Math.max(0, minutesIncluded - planBaseMinutes);
  const resetDate = (() => {
    if (!minutesResetDate) return 'N/A';
    const d = new Date(minutesResetDate + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    while (d < today) d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
  })();

  const inboxAddress = agent.portal_email ? inboxAddressFor(agent.portal_email) : null;

  // AI ops: account-level pool (SUM of all agents in account)
  const { data: opsAgents } = agent.portal_email
    ? await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', agent.portal_email)
    : { data: null };
  const aiOpsUsed  = (opsAgents ?? []).reduce((s, a) => s + (((a as any).ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit = (opsAgents ?? []).reduce((s, a) => s + (((a as any).ai_ops_limit as number) ?? 0), 0);
  const aiOpsPct   = aiOpsLimit > 0 ? Math.min((aiOpsUsed / aiOpsLimit) * 100, 100) : 0;
  const aiOpsColor = aiOpsPct > 90 ? '#ef4444' : aiOpsPct > 70 ? '#f59e0b' : '#22c55e';

  const supportWhatsApp    = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';
  const supportEmail       = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
  const centineliReviewUrl = process.env.NEXT_PUBLIC_CENTINELIA_REVIEW_URL ?? '';

  // ── Data per tab ───────────────────────────────────────────────────────────
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  const [callsRes, leadsRes, ordersRes, apptsRes, allCallsRes, outboundRes, contactLeadsRes, contactWALeadsRes, contactOutboundRes, outboundCampaignsRes, emailIntsRes] = await Promise.all([
    // Calls, always needed (resumen + minutos tab for allCalls)
    since
      ? supabase.from('voice_calls').select('*').eq('agent_id', agent.id).gte('created_at', since).order('created_at', { ascending: false }).limit(100)
      : supabase.from('voice_calls').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(100),
    showLeads  ? supabase.from('leads_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showOrders ? supabase.from('orders_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showAppts  ? supabase.from('appointments_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('voice_calls').select('duration_seconds, created_at').eq('agent_id', agent.id).order('created_at', { ascending: true }),
    showOutbound ? supabase.from('outbound_calls').select('*').eq('agent_id', agent.id).order('scheduled_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    // Contacts tab
    supabase.from('leads_voice').select('id, nombre, whatsapp, telefono, email, servicio, presupuesto, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('wa_leads').select('id, nombre, customer_number, whatsapp, email, negocio, giro, servicio, presupuesto, timeline, notas, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('outbound_contacts').select('id, nombre, telefono, motivo, source, status, fail_count, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('outbound_campaigns').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
    supabase.from('email_integrations').select('provider, email, needs_reauth').eq('agent_id', agent.id),
  ]);

  const calls             = (callsRes.data           ?? []) as VoiceCall[];
  const leads             = leadsRes.data            ?? [];
  const orders            = ordersRes.data           ?? [];
  const appts             = apptsRes.data            ?? [];
  const allCalls          = allCallsRes.data         ?? [];
  const outboundCalls     = (outboundRes.data        ?? []) as OutboundCall[];
  const contactVoiceLeads = (contactLeadsRes.data    ?? []) as ContactVoiceLead[];
  const contactWALeads    = (contactWALeadsRes.data  ?? []) as ContactWALead[];
  const contactOutbound   = (contactOutboundRes.data   ?? []) as ContactOutbound[];
  const outboundCampaigns = outboundCampaignsRes.data  ?? [];
  const reauthAlerts      = (emailIntsRes.data ?? []).filter((i: any) => i.needs_reauth) as { provider: 'gmail' | 'outlook'; email: string }[];

  // Build caller-number → client-name lookup from captured leads/appts/orders
  const normPhone = (p: string) => (p ?? '').replace(/\D/g, '');
  const callerNames: Record<string, string> = {};
  for (const l of leads as any[]) {
    if (l.whatsapp && l.nombre) { const k = normPhone(l.whatsapp); if (k && !callerNames[k]) callerNames[k] = l.nombre; }
  }
  for (const a of appts as any[]) {
    if (a.telefono && a.nombre) { const k = normPhone(a.telefono); if (k && !callerNames[k]) callerNames[k] = a.nombre; }
  }
  for (const o of orders as any[]) {
    if (o.telefono && o.nombre) { const k = normPhone(o.telefono); if (k && !callerNames[k]) callerNames[k] = o.nombre; }
  }

  const totalDuration  = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
  const totalMinutes   = Math.ceil(totalDuration / 60);
  const avgDuration    = calls.length > 0 ? Math.round(totalDuration / calls.length / 60) : 0;
  const pendingOrders  = orders.filter((o: any) => o.status === 'nuevo' || o.status === 'en_proceso').length;
  const confirmedAppts = appts.filter((a: any) => a.status === 'confirmada').length;
  const isFirstTime    = allCalls.length === 0;

  const hourCounts: number[] = new Array(24).fill(0);
  for (const c of calls) hourCounts[new Date((c as any).created_at).getHours()]++;

  const allTimeTotalMin = allCalls.reduce((s: number, c: any) => s + Math.ceil((c.duration_seconds ?? 0) / 60), 0);
  const firstCallDate   = allCalls.length > 0 ? new Date((allCalls[0] as any).created_at) : null;
  const daysSinceFirst  = firstCallDate ? Math.max(1, Math.ceil((Date.now() - firstCallDate.getTime()) / 86400000)) : 1;
  const avgMinPerDay    = allCalls.length > 0 ? (allTimeTotalMin / daysSinceFirst).toFixed(1) : '0';
  const avgMinPerWeek   = allCalls.length > 0 ? Math.round(allTimeTotalMin / (daysSinceFirst / 7)) : 0;
  const avgMinPerMonth  = allCalls.length > 0 ? Math.round(allTimeTotalMin / (daysSinceFirst / 30)) : 0;

  const outboundCallCount = showOutbound
    ? (since ? outboundCalls.filter((c: any) => c.called_at && c.called_at >= since).length : outboundCalls.length)
    : 0;
  const showOps      = aiOpsLimit > 0;
  const kpiCount     = 2
    + (showLeads  && leads.length  > 0 ? 1 : 0)
    + (showOrders && orders.length > 0 ? 1 : 0)
    + (showAppts  && appts.length  > 0 ? 1 : 0)
    + (showOutbound && outboundCallCount > 0 ? 1 : 0)
    + (showOps ? 1 : 0);
  const kpiGridClass = kpiCount <= 2 ? 'grid-cols-2' : kpiCount === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4';

  // Activity feed — merges calls + leads + orders + appts sorted by time
  const resumenFeed: Array<{ type: 'call'|'lead'|'order'|'appt'; id: string; label: string; badge: string; sub: string|null; created_at: string }> = [
    ...calls.map(c => ({
      type:       'call' as const,
      id:         c.id,
      label:      callerNames[normPhone(c.caller_number ?? '')] ?? c.caller_number,
      badge:      c.outcome as string,
      sub:        `${Math.max(1, Math.ceil(c.duration_seconds / 60))} min`,
      created_at: c.created_at,
    })),
    ...(showLeads  ? leads.map((l: any)  => ({ type: 'lead'  as const, id: l.id, label: (l.nombre  ?? 'Cliente') as string, badge: 'lead',  sub: null as string|null, created_at: l.created_at as string })) : []),
    ...(showOrders ? orders.map((o: any) => ({ type: 'order' as const, id: o.id, label: (o.nombre  ?? 'Cliente') as string, badge: 'order', sub: o.total != null ? `$${o.total}` : null, created_at: o.created_at as string })) : []),
    ...(showAppts  ? appts.map((a: any)  => ({ type: 'appt'  as const, id: a.id, label: (a.nombre  ?? 'Cliente') as string, badge: 'appt',  sub: a.fecha ? new Date(a.fecha + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null, created_at: a.created_at as string })) : []),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
   .slice(0, 5);

  // Outbound snapshot
  const pendingOutboundCount    = showOutbound ? (contactOutbound as any[]).filter((c: any) => c.status === 'pending').length : 0;
  const activeOutboundCampaigns = showOutbound ? (outboundCampaigns as any[]).filter((c: any) => c.status === 'active').length  : 0;
  const lastCampaignRunAt       = showOutbound ? ((outboundCampaigns as any[]).find((c: any) => c.last_run_at)?.last_run_at ?? null) : null;

  const hasOpsAgent = (allClientAgents as any[]).some((a: any) => a.role) || !!(agent as any).role;

  // Per-agent context estimates (tokens ≈ chars / 4) for Inicio widget
  const agentContextCards = allClientAgents.map(a => {
    const kb   = ((a as any).knowledge_base         as string | null) ?? '';
    const rkb  = ((a as any).role_knowledge_base    as string | null) ?? '';
    const rl   = ((a as any).role_learnings         as string | null) ?? '';
    const total = Math.ceil((kb.length + rkb.length + rl.length) / 4);
    return {
      name:   (a.agent_name?.trim() || 'Empleado'),
      role:   ((a as any).role as string | null)?.trim() ?? null,
      tokens: total,
    };
  });

  const TABS: { id: Tab; label: string }[] = [
    { id: 'inicio',        label: 'Inicio' },
    { id: 'llamadas',      label: 'Llamadas' },
    ...(hasOpsAgent ? [{ id: 'oficina' as Tab, label: 'Oficina' }] : []),
    { id: 'agentes' as Tab, label: 'Empleados' },
    { id: 'negocio',       label: 'Negocio' },
    { id: 'integraciones', label: 'Integraciones' },
    { id: 'cuenta',        label: 'Cuenta' },
  ];

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen relative flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)', overflowX: 'clip' }}>
        {/* Ambient orb, top center */}
        <div style={{ position: 'absolute', width: 900, height: 500, top: -320, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse, rgba(108,59,255,0.13) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* Header */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <BusinessSwitcher
              current={{
                business_name: agent.business_name,
                logo_url:      (agent as any).logo_url ?? null,
                first_token:   token,
              }}
              options={businessGroups.map(g => ({
                business_name: g.business_name,
                logo_url:      g.logo_url,
                first_token:   g.first_token,
              }))}
              currentBusinessName={agent.business_name}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <NotificationBell token={token} />
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Body: sidebar + main */}
        <div className="flex flex-1">
          <PortalSidebar
            token={token}
            currentTab={tab}
            hasOpsAgent={hasOpsAgent}
            showOutbound={showOutbound || agent.plan === 'pro'}
            hasStripe={hasStripe}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            isOwner={isOwner}
            modules={modules}
          />

          {/* Main content column */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Tab nav — mobile only */}
            <div className="md:hidden" style={{ background: 'var(--c-modal)', borderBottom: '1px solid var(--c-border)', position: 'sticky', top: 53, zIndex: 9 }}>
              <div className="px-4 sm:px-6">
                <PortalTabNav token={token} currentTab={tab} tabs={TABS} />
              </div>
            </div>

        {/* Alerts */}
        {(!agent.active || minutesPct > 80) && (
          <div className="px-4 sm:px-6 pt-4 flex flex-col gap-2 max-w-4xl w-full mx-auto md:mx-0">
            {billingPaused && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <AlertTriangle size={15} color="#f87171" className="flex-shrink-0" />
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                  Tu agente está pausado por falta de pago. Actualiza tu método de pago o contacta a Centinelia.
                </p>
              </div>
            )}
            {clientPaused && !billingPaused && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <AlertTriangle size={15} color="#fbbf24" className="flex-shrink-0" />
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                  Tu agente está pausado voluntariamente. Puedes reanudarlo cuando quieras desde la pestaña Resumen.
                </p>
              </div>
            )}
            {minutesPct > 80 && agent.active && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <AlertTriangle size={15} color="#fbbf24" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                    Estás al {Math.round(minutesPct)}% de tus minutos, te quedan {minutesRemain} min
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#fbbf24' }}>Reset el {resetDate}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab content */}
        <div className={`px-4 sm:px-6 py-6 w-full md:mx-0 ${tab === 'inicio' || tab === 'negocio' || tab === 'cuenta' ? 'max-w-6xl' : 'max-w-4xl'}`} style={{ position: 'relative', zIndex: 1 }}>

          {/* ── INICIO (dashboard) ───────────────────────────────────────── */}
          {tab === 'inicio' && (
            <div className="flex flex-col gap-5">
              {isFirstTime && (
                <div className="flex items-end gap-4 px-5 pt-2 pb-4 rounded-xl overflow-hidden"
                  style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
                  <div className="relative flex-shrink-0" style={{ width: 72, height: 100 }}>
                    <Image src="/agent-m1.png" alt="" fill sizes="72px"
                      style={{ objectFit: 'contain', objectPosition: 'bottom' }} />
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold mb-1" style={{ color: '#6C3BFF' }}>¡Tu equipo está listo!</p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                      En cuanto llegue la primera llamada, los registros aparecerán aquí automáticamente.
                    </p>
                  </div>
                </div>
              )}

              {/* Reauth alerts — mobile strip */}
              {reauthAlerts.length > 0 && (
                <div className="flex flex-col gap-2 lg:hidden">
                  {reauthAlerts.map(alert => (
                    <Link key={alert.provider}
                      href={`/portal/${token}?tab=integraciones`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                      <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
                          {alert.provider === 'gmail' ? 'Gmail' : 'Outlook'} requiere reconexion
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{alert.email}</p>
                      </div>
                      <ChevronRight size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    </Link>
                  ))}
                </div>
              )}

              {/* Period filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Período:</span>
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  {[{ label: '7 días', param: '7' }, { label: '30 días', param: '30' }, { label: 'Todo', param: '' }].map(({ label, param }) => {
                    const active = (period ?? '') === param;
                    return (
                      <Link key={param} href={param ? `/portal/${token}?tab=inicio&period=${param}` : `/portal/${token}?tab=inicio`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: active ? '#6C3BFF' : 'transparent', color: active ? '#fff' : 'var(--c-text-3)' }}>
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Two-column layout from KPIs down */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">

              {/* ── Main column ── */}
              <div className="flex flex-col gap-5">

                {/* KPI cards */}
                <div id="resumen" className={`grid ${kpiGridClass} gap-3`}>
                  <KpiCard icon={<PhoneCall size={16} color="#6C3BFF" />}     value={String(calls.length)}        label="Llamadas"        sub={`prom. ${avgDuration} min`}                                                                                  valueColor="#6C3BFF"       accentColor="#6C3BFF"  />
                  <KpiCard icon={<Clock size={16} color="#6b7280" />}         value={`${totalMinutes} min`}       label="Tiempo atendido"                                                                                                                   valueColor="var(--c-text)" accentColor="#6b7280"  />
                  {showLeads   && leads.length  > 0 && <KpiCard icon={<Users size={16} color="#22c55e" />}         value={String(leads.length)}  label="Leads"    sub={calls.length > 0 ? `${Math.round((leads.length / calls.length) * 100)}% conv.` : undefined} valueColor="#22c55e"  accentColor="#22c55e"  />}
                  {showOrders  && orders.length > 0 && <KpiCard icon={<ShoppingBag size={16} color="#f59e0b" />}   value={String(orders.length)} label="Pedidos"  sub={pendingOrders > 0 ? `${pendingOrders} pendientes` : undefined}                      valueColor="#f59e0b"  accentColor="#f59e0b"  />}
                  {showAppts   && appts.length  > 0 && <KpiCard icon={<CalendarDays size={16} color="#3b82f6" />}  value={String(appts.length)}  label="Citas"    sub={confirmedAppts > 0 ? `${confirmedAppts} confirmadas` : undefined}                   valueColor="#3b82f6"  accentColor="#3b82f6"  />}
                  {showOutbound && outboundCallCount > 0 && <KpiCard icon={<PhoneOutgoing size={16} color="#a855f7" />} value={String(outboundCallCount)} label="Salientes"                                                                                 valueColor="#a855f7"  accentColor="#a855f7"  />}
                  {showOps && <KpiCard icon={<Zap size={16} color="#06b6d4" />} value={String(aiOpsUsed)} label="Ops IA" sub={`de ${aiOpsLimit} disponibles`} valueColor="#06b6d4" accentColor="#06b6d4" />}
                </div>

                {/* Peak hours */}
                {calls.length > 0 && (
                  <div id="horas-pico" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                      Horas pico
                    </h2>
                    <PeakHoursChart hourCounts={hourCounts} />
                  </div>
                )}

                {/* Activity feed */}
                <div id="actividad" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                    Actividad reciente
                  </h2>
                  {resumenFeed.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <div className="relative" style={{ width: 64, height: 88 }}>
                        <Image src="/agent-f2.png" alt="" fill sizes="64px"
                          style={{ objectFit: 'contain', objectPosition: 'bottom' }} />
                      </div>
                      <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin actividad en este período</p>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {resumenFeed.map((item, idx) => {
                        const cfg = item.type === 'call'
                          ? (FEED_OUTCOME[item.badge] ?? FEED_OUTCOME.other)
                          : (FEED_TYPE_CFG[item.badge] ?? FEED_TYPE_CFG.lead);
                        return (
                          <div key={`${item.type}-${item.id}`}
                            className="flex items-center gap-3 py-2.5"
                            style={{ borderBottom: idx < resumenFeed.length - 1 ? '1px solid var(--c-divider)' : 'none' }}>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: cfg.bg, color: cfg.color }}>
                              {item.type === 'call'  && <Phone        size={12} />}
                              {item.type === 'lead'  && <Users        size={12} />}
                              {item.type === 'order' && <ShoppingBag  size={12} />}
                              {item.type === 'appt'  && <CalendarDays size={12} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block" style={{ color: 'var(--c-text)' }}>
                                {item.label}
                              </span>
                              {item.sub && (
                                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{item.sub}</span>
                              )}
                            </div>
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                              style={{ background: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                            <span className="text-xs flex-shrink-0 hidden sm:block" style={{ color: 'var(--c-text-3)' }}>
                              {fmtRelative(item.created_at)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Reporte mensual — visible en mobile al final de la columna principal */}
                <div className="lg:hidden rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reporte mensual</h2>
                    <InfoTooltip text="Descarga el resumen del mes con llamadas, resultados, minutos y horas pico." />
                  </div>
                  <MonthReportPicker token={token} />
                </div>

                {/* Contexto de empleados — mobile */}
                <div className="lg:hidden rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Contexto de empleados</h2>
                    <InfoTooltip text="Cuánto contexto tiene cada empleado cargado en su memoria." />
                  </div>
                  <div className="flex flex-col gap-3">
                    {agentContextCards.map((a, i) => {
                      const ctx   = Math.min(a.tokens, 32_000);
                      const pct   = Math.round((ctx / 32_000) * 100);
                      const color = pct > 80 ? '#22c55e' : pct > 40 ? '#6C3BFF' : '#9ca3af';
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--c-text)' }}>{a.name}</p>
                              {a.role && <p className="text-[11px] truncate" style={{ color: 'var(--c-text-3)' }}>{a.role}</p>}
                            </div>
                            <span className="text-xs tabular-nums flex-shrink-0" style={{ color }}>
                              {a.tokens >= 1000 ? `${(a.tokens / 1000).toFixed(1)}k` : a.tokens} tok
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>{/* end main column */}

              {/* ── Right column (desktop only) ── */}
              <div className="hidden lg:flex flex-col gap-4">


                {showOutbound && (
                  <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
                        <PhoneOutgoing size={13} /> Salientes
                      </h2>
                      <Link href={`/portal/${token}/llamadas/salientes`}
                        className="text-xs transition-opacity hover:opacity-70"
                        style={{ color: '#9B6DFF' }}>
                        Ver →
                      </Link>
                    </div>
                    <div className="flex flex-col gap-3">
                      <StatBox label="Campañas activas"     value={String(activeOutboundCampaigns)} />
                      <StatBox label="Contactos pendientes" value={String(pendingOutboundCount)}    />
                      <StatBox label="Última ejecución"     value={lastCampaignRunAt ? fmtRelative(lastCampaignRunAt) : 'Nunca'} />
                    </div>
                  </div>
                )}

                {/* Reporte mensual — desktop sidebar */}
                <div id="reporte-mensual" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reporte mensual</h2>
                    <InfoTooltip text="Descarga el resumen del mes con llamadas, resultados, minutos y horas pico." />
                  </div>
                  <MonthReportPicker token={token} />
                </div>

                {/* Contexto de empleados */}
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Contexto de empleados</h2>
                    <InfoTooltip text="Cuánto contexto tiene cada empleado cargado en su memoria (base de conocimiento + instrucciones de rol + aprendizajes). A más contexto, más informado está el empleado." />
                  </div>
                  <div className="flex flex-col gap-3">
                    {agentContextCards.map((a, i) => {
                      const ctx   = Math.min(a.tokens, 32_000);
                      const pct   = Math.round((ctx / 32_000) * 100);
                      const color = pct > 80 ? '#22c55e' : pct > 40 ? '#6C3BFF' : '#9ca3af';
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--c-text)' }}>{a.name}</p>
                              {a.role && <p className="text-[11px] truncate" style={{ color: 'var(--c-text-3)' }}>{a.role}</p>}
                            </div>
                            <span className="text-xs tabular-nums flex-shrink-0" style={{ color }}>
                              {a.tokens >= 1000 ? `${(a.tokens / 1000).toFixed(1)}k` : a.tokens} tok
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              </div>
            </div>
          )}

          {/* ── OFICINA (ops only) ───────────────────────────────────────── */}
          {/* ── NEGOCIO ──────────────────────────────────────────────────── */}
          {tab === 'negocio' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">

              {/* Main column */}
              <div className="flex flex-col gap-5">
                {agent.portal_email && (
                  <OrgCard token={token} portalEmail={agent.portal_email} logoUrl={(agent as any).logo_url ?? null} initialDescription={(agent as any).business_description ?? ''} />
                )}

                <div id="branding" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Branding de documentos y correos</h2>
                    <InfoTooltip text="Define los colores, datos de contacto y pie de página que aparecen en todos los correos y documentos que genera tu agente." />
                  </div>
                  <BrandKitEditor
                    token={token}
                    logoUrl={(agent as any).logo_url ?? null}
                    businessName={agent.business_name}
                    agentName={agent.agent_name ?? agent.business_name}
                    initialColor={(agent as any).email_brand_color ?? '#6C3BFF'}
                    initialColorSecondary={(agent as any).brand_color_secondary ?? ''}
                    initialWebsite={(agent as any).brand_website ?? ''}
                    initialAddress={(agent as any).brand_address ?? ''}
                    initialFooter={(agent as any).email_footer_text ?? ''}
                  />
                </div>

                <div id="conocimiento" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Manual de la organización</h2>
                    <InfoTooltip text="Todo lo que tu empleado debe saber sobre la organización: servicios, precios, horarios, políticas y preguntas frecuentes. Se usa en llamadas, correos y mensajes." />
                  </div>
                  <KnowledgeBaseEditor
                    token={token}
                    initialValue={(agent as any).knowledge_base ?? ''}
                    websiteSynced={!!((agent as any).website_knowledge)}
                    hasDescription={!!((agent as any).business_description?.trim())}
                  />
                </div>

                <div id="perfil-dueno" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Perfil del responsable</h2>
                    <InfoTooltip text="Cuéntale a tu empleado quién eres, cuáles son tus prioridades y cómo te gusta que se hagan las cosas. Se comparte con todos tus empleados automáticamente." />
                  </div>
                  <OwnerProfileEditor
                    token={token}
                    initialValue={(agent as any).owner_profile ?? ''}
                  />
                </div>

                <div id="sitio" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Sitio web</h2>
                    <InfoTooltip text="Sincroniza tu sitio para que el agente tenga siempre la información actualizada de tu organización." />
                  </div>
                  <WebsiteSyncButton token={token} currentUrl={(agent as any).business_website ?? null} />
                  <div style={{ borderTop: '1px solid var(--c-border)', margin: '20px -20px 16px' }} />
                  <div className="flex items-center gap-1.5 mb-3">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reseñas</h2>
                    <InfoTooltip text="El agente envía este link a tus clientes por WhatsApp al finalizar llamadas exitosas para que dejen una reseña." />
                  </div>
                  <ReviewLinkEditor token={token} initialValue={(agent as any).google_review_url ?? ''} />
                </div>
              </div>

              {/* Right column — Horario de atención */}
              <div>
                <div id="horarios" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Horario de atención</h2>
                    <InfoTooltip text="Define los días y horarios en que tu agente está disponible para atender llamadas." />
                  </div>
                  <BusinessHoursEditor token={token} initialHours={(agent.business_hours ?? null) as BusinessHours | null} />
                </div>
              </div>

            </div>
          )}

          {/* ── INTEGRACIONES ────────────────────────────────────────────── */}
          {tab === 'integraciones' && (
            <div className="flex flex-col gap-5">
              <IntegrationsHub
                token={token}
                plan={agent.plan as Plan}
                hasOpsAgent={hasOpsAgent}
                hasNotion={!!(agent as any).notion_access_token}
                inboxAddress={inboxAddress}
              />
              <PoliciesSection token={token} />
            </div>
          )}

          {/* ── CUENTA ───────────────────────────────────────────────────── */}
          {tab === 'cuenta' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

                {/* ── Left column ── */}
                <div className="flex flex-col gap-5">
                  {/* Minutes & billing */}
                  <div id="minutos" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                    {allCalls.length > 0 && (
                      <div className="rounded-xl p-5 mb-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                        <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Consumo promedio</h2>
                        <div className="grid grid-cols-3 gap-3">
                          <StatBox label="Por día"   value={`${avgMinPerDay} min`} />
                          <StatBox label="Por semana" value={`${avgMinPerWeek} min`} />
                          <StatBox label="Por mes"    value={`${avgMinPerMonth} min`} highlight={avgMinPerMonth > minutesIncluded * 0.9} />
                        </div>
                        <p className="text-xs mt-3" style={{ color: 'var(--c-text-4)' }}>Histórico: {allTimeTotalMin} min en {daysSinceFirst} días</p>
                      </div>
                    )}
                    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Uso del mes</h2>
                      <div className="flex items-end gap-2 mb-2">
                        <span className="text-4xl font-bold tabular-nums" style={{ color: minutesColor }}>{minutesUsed}</span>
                        <span className="text-sm mb-1" style={{ color: 'var(--c-text-3)' }}>/ {minutesIncluded} min</span>
                      </div>
                      <div className="w-full h-3 rounded-full overflow-hidden mb-2" style={{ background: 'var(--c-border)' }}>
                        <div className="h-3 rounded-full transition-all" style={{ width: `${minutesPct}%`, background: minutesColor }} />
                      </div>
                      <div className="flex justify-between text-xs" style={{ color: 'var(--c-text-3)' }}>
                        <span>{Math.round(minutesPct)}% consumido · {minutesRemain} disponibles</span>
                        <span>Se renueva el {resetDate}</span>
                      </div>
                      {rolloverMinutes > 0 && (
                        <p className="text-xs mt-2" style={{ color: '#6C3BFF' }}>
                          {planBaseMinutes} base + {rolloverMinutes} del mes anterior
                        </p>
                      )}
                    </div>
                  </div>

                  {aiOpsLimit > 0 && (
                    <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Operaciones AI este mes</h2>
                      <div className="flex items-end gap-2 mb-2">
                        <span className="text-4xl font-bold tabular-nums" style={{ color: aiOpsColor }}>{aiOpsUsed}</span>
                        <span className="text-sm mb-1" style={{ color: 'var(--c-text-3)' }}>/ {aiOpsLimit} ops</span>
                      </div>
                      <div className="w-full h-3 rounded-full overflow-hidden mb-2" style={{ background: 'var(--c-border)' }}>
                        <div className="h-3 rounded-full transition-all" style={{ width: `${aiOpsPct}%`, background: aiOpsColor }} />
                      </div>
                      <div className="flex justify-between text-xs" style={{ color: 'var(--c-text-3)' }}>
                        <span>{Math.round(aiOpsPct)}% consumido · {Math.max(0, aiOpsLimit - aiOpsUsed)} disponibles</span>
                        <span>Se renueva el {resetDate}</span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl p-5" style={{
                    background:     minutesPct >= 70 ? 'rgba(108,59,255,0.03)' : 'var(--c-surface)',
                    border:         minutesPct >= 90 ? '1px solid rgba(239,68,68,0.35)' : minutesPct >= 70 ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border-2)',
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  }}>
                    <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Comprar minutos extra</h2>
                    {minutesPct >= 70 && (
                      <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: minutesPct >= 90 ? '#ef4444' : '#f59e0b' }}>
                        <AlertTriangle size={11} />
                        {minutesPct >= 90 ? 'Te quedan muy pocos minutos' : 'Tu saldo está bajando'}
                      </p>
                    )}
                    <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Se suman al saldo actual al instante. No afectan tu plan mensual.</p>
                    <BuyMinutesSection token={token} />

                    <div style={{ borderTop: '1px solid var(--c-border)', margin: '16px -20px', paddingLeft: 20, paddingRight: 20 }} />

                    <h3 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Recarga automática</h3>
                    <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Activa para recargar automáticamente cuando el saldo baje de un umbral.</p>
                    <AutoRefillSection token={token} />
                  </div>

                  {agent.plan && (
                    <div id="plan" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <div className="flex items-center gap-1.5 mb-4">
                        <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Cambiar plan</h2>
                        <InfoTooltip text="Sube o baja de tier según las necesidades de tu organización." />
                      </div>
                      <UpgradePlanSection token={token} currentPlan={agent.plan as Plan} currentTier={(agent as any).minutes_plan ?? 'starter'} />
                    </div>
                  )}
                </div>

                {/* ── Right column — Historial de minutos ── */}
                <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                  <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Historial de minutos</h2>
                    <div className="relative">
                      <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
                        <MinutesLedgerSection agentId={agent.id} minutesIncluded={minutesIncluded} minutesUsed={minutesUsed} callerNames={callerNames} />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                        style={{ background: 'linear-gradient(to bottom, transparent, var(--c-surface))' }} />
                    </div>
                  </div>
                </div>

              </div>

              {/* Contract — full width below grid */}
              <div id="contrato" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                <ContractSection
                  token={token}
                  businessName={agent.business_name}
                  signedAt={agent.contract_accepted_at ?? null}
                  contractPreviewUrl={`/portal/${token}/contrato`}
                />
              </div>
            </div>
          )}
        </div>

            <PortalFooter />
          </div>{/* /main content column */}
        </div>{/* /body flex */}

      </div>

    </ThemeProvider>
  );
}

function KpiCard({ icon, value, label, sub, valueColor = 'var(--c-text)', accentColor }: {
  icon: React.ReactNode; value: string; label: string; sub?: string; valueColor?: string; accentColor?: string;
}) {
  const accent = accentColor ?? valueColor;
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}66)` }} />
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="p-1.5 rounded-lg flex-shrink-0"
            style={{ background: `${accent}15`, border: `1px solid ${accent}30` }}>{icon}</div>
          <div className="text-xl font-bold tabular-nums leading-none" style={{ color: valueColor }}>{value}</div>
        </div>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{label}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <div className="text-sm font-bold" style={{ color: highlight ? '#ef4444' : 'var(--c-text)' }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>{label}</div>
    </div>
  );
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'ayer';
  if (days < 7)  return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
