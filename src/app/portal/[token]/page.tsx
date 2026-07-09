export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, CheckCircle, XCircle, CreditCard, PhoneCall, PhoneOutgoing, Users, ShoppingBag, CalendarDays, MessageCircle, Mail, AlertTriangle, ChevronRight, ExternalLink, Plus, Clock } from 'lucide-react';
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
import PauseResumeButton       from './PauseResumeButton';
import LogoUploader            from './LogoUploader';
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
import LiveNotifications       from './LiveNotifications';
import SupportChat             from './SupportChat';
import CallsSearch             from './CallsSearch';
import IntegrationsSection     from './IntegrationsSection';
import PortalTabNav           from './PortalTabNav';
import KnowledgeBaseEditor    from './KnowledgeBaseEditor';
import WebsiteSyncButton      from './WebsiteSyncButton';
import ReviewLinkEditor       from './ReviewLinkEditor';
import BusinessHoursEditor    from './BusinessHoursEditor';
import PortalOutboundSection     from './PortalOutboundSection';
import PortalContactsSection     from './PortalContactsSection';
import OutboundSection           from './OutboundSection';
import OutboundToggles           from './OutboundToggles';
import AutoRefillSection         from './AutoRefillSection';
import LearningsSection          from './LearningsSection';
import TeamFeed                  from './TeamFeed';
import EmailSettings             from './EmailSettings';
import type { OutboundCall }     from './PortalOutboundSection';
import type { ContactVoiceLead, ContactWALead, ContactOutbound } from './PortalContactsSection';

type Tab = 'agentes' | 'negocio' | 'entrantes' | 'resumen' | 'actividad' | 'minutos' | 'contrato' | 'integraciones' | 'salientes' | 'contactos' | 'equipo' | 'correos';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string; period?: string }>;
}

const PLAN_LABELS: Record<string, string> = { comercial: 'Comercial', pro: 'Pro' };
const PLAN_COLORS: Record<string, string> = { comercial: '#3b82f6', pro: '#a855f7' };
const OUTBOUND_ROLE_LABELS: Record<string, string> = {
  vendedor: 'Vendedor', cotizador: 'Cotizador', seguimiento: 'Seguimiento',
  recuperacion: 'Recuperación', cobrador: 'Cobrador',
};

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
  const tab: Tab           = (tabParam as Tab) ?? 'agentes';
  const days               = period ? parseInt(period) : undefined;

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

  // All agents for this client (same portal_email)
  // In dev the middleware bypasses auth so session is null — fall back to the agent's own email
  const lookupEmail = session?.portalEmail ?? (agent as any).portal_email ?? null;
  const { data: clientAgents } = lookupEmail
    ? await supabase
        .from('voice_agents')
        .select('id, business_name, agent_name, portal_token, active, client_paused, billing_status, plan, phone_number, logo_url, features, outbound_role, stripe_customer_id')
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
  const resetDate       = minutesResetDate
    ? new Date(minutesResetDate + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
    : 'N/A';

  const aiOpsUsed  = (agent.ai_ops_used  as number | null) ?? 0;
  const aiOpsLimit = (agent.ai_ops_limit as number | null) ?? 0;
  const aiOpsPct   = aiOpsLimit > 0 ? Math.min((aiOpsUsed / aiOpsLimit) * 100, 100) : 0;
  const aiOpsColor = aiOpsPct > 90 ? '#ef4444' : aiOpsPct > 70 ? '#f59e0b' : '#22c55e';

  const supportWhatsApp    = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';
  const supportEmail       = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
  const centineliReviewUrl = process.env.NEXT_PUBLIC_CENTINELIA_REVIEW_URL ?? '';

  // ── Data per tab ───────────────────────────────────────────────────────────
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  const [callsRes, leadsRes, ordersRes, apptsRes, allCallsRes, outboundRes, contactLeadsRes, contactWALeadsRes, contactOutboundRes, outboundCampaignsRes] = await Promise.all([
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
  const totalHours     = (totalDuration / 3600).toFixed(1);
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
  const kpiCount     = 2
    + (showLeads  && leads.length  > 0 ? 1 : 0)
    + (showOrders && orders.length > 0 ? 1 : 0)
    + (showAppts  && appts.length  > 0 ? 1 : 0)
    + (showOutbound && outboundCallCount > 0 ? 1 : 0);
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
   .slice(0, 8);

  // Outbound snapshot
  const pendingOutboundCount    = showOutbound ? (contactOutbound as any[]).filter((c: any) => c.status === 'pending').length : 0;
  const activeOutboundCampaigns = showOutbound ? (outboundCampaigns as any[]).filter((c: any) => c.status === 'active').length  : 0;
  const lastCampaignRunAt       = showOutbound ? ((outboundCampaigns as any[]).find((c: any) => c.last_run_at)?.last_run_at ?? null) : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'agentes',       label: 'Agentes' },
    { id: 'negocio',       label: 'Negocio' },
    { id: 'equipo',        label: 'Equipo' },
    { id: 'entrantes',     label: 'Entrantes' },
    ...(agent.plan === 'pro' ? [{ id: 'salientes' as Tab, label: 'Salientes' }] : []),
    { id: 'resumen',       label: 'Resumen' },
    { id: 'actividad',     label: 'Actividad' },
    { id: 'minutos',       label: 'Minutos' },
    { id: 'correos',       label: 'Correos' },
    { id: 'integraciones', label: 'Integraciones' },
    { id: 'contrato',      label: 'Contrato' },
  ];

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
        {/* Ambient orb, top center */}
        <div style={{ position: 'absolute', width: 900, height: 500, top: -320, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse, rgba(108,59,255,0.13) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* Header */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'relative', zIndex: 10 }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
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
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              {hasStripe && (
                <a href={`/api/billing/portal-session?token=${token}`}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ background: '#6C3BFF', color: '#fff' }}>
                  <CreditCard size={13} /><span className="hidden sm:inline">Suscripción</span>
                </a>
              )}
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid var(--c-border)', position: 'relative', zIndex: 9 }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="relative">
              <PortalTabNav token={token} currentTab={tab} tabs={TABS} />
            </div>
          </div>
        </div>

        {/* Alerts */}
        {(!agent.active || minutesPct > 80) && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 flex flex-col gap-2">
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6" style={{ position: 'relative', zIndex: 1 }}>

          {/* ── AGENTES ──────────────────────────────────────────────────── */}
          {tab === 'agentes' && (
            <div className="flex flex-col gap-5">
              {/* Add agent CTA */}
              <Link
                href={`/registro?back=/portal/${token}`}
                className="flex items-center justify-between px-5 py-4 rounded-xl transition-all group"
                style={{ background: 'rgba(108,59,255,0.06)', border: '1px dashed rgba(108,59,255,0.35)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(108,59,255,0.15)', border: '1px solid rgba(108,59,255,0.3)' }}>
                    <Plus size={16} color="#9B6DFF" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#9B6DFF' }}>Agregar otro agente</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                      Usa el mismo correo para que aparezca aquí automáticamente
                    </p>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: '#6C3BFF', flexShrink: 0 }} />
              </Link>

              {businessGroups.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-14 rounded-xl"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                    <PhoneCall size={22} style={{ color: '#6C3BFF', opacity: 0.5 }} />
                  </div>
                  <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin agentes asociados a tu cuenta</p>
                  <p className="text-xs text-center px-10" style={{ color: 'var(--c-text-3)' }}>
                    Contrata tu primer agente usando el mismo correo y aparecerá aquí automáticamente.
                  </p>
                </div>
              )}

              {businessGroups.map(group => (
                <div key={group.business_name} className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--c-border)' }}>

                  {/* Business header */}
                  <div className="flex items-center gap-4 px-5 py-4"
                    style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                      {group.logo_url
                        ? <img src={group.logo_url} alt={group.business_name} className="w-full h-full object-contain p-1" />
                        : <span className="text-sm font-bold" style={{ color: 'var(--c-text-3)' }}>
                            {group.business_name.slice(0, 2).toUpperCase()}
                          </span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{group.business_name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                        {group.agents.length} {group.agents.length === 1 ? 'agente' : 'agentes'}
                      </p>
                    </div>
                  </div>

                  {/* Agents */}
                  {group.agents.map((a: any, i: number) => {
                    const isBillingPaused = !a.active && a.billing_status === 'pago_fallido';
                    const isClientPaused  = !!(a.client_paused) && !isBillingPaused;
                    const isInactive      = !a.active && !isBillingPaused && !isClientPaused;
                    const isCurrent       = a.portal_token === token;
                    const isOnline        = a.active && !isClientPaused && !isBillingPaused;

                    let statusLabel = 'Activo';
                    let statusColor = '#16a34a';
                    let statusBg    = 'rgba(34,197,94,0.1)';
                    if (isBillingPaused) { statusLabel = 'Pago pendiente'; statusColor = '#dc2626'; statusBg = 'rgba(239,68,68,0.08)'; }
                    else if (isClientPaused) { statusLabel = 'Pausado'; statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,0.1)'; }
                    else if (isInactive) { statusLabel = 'Inactivo'; statusColor = '#6b7280'; statusBg = 'rgba(107,114,128,0.1)'; }

                    return (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3"
                        style={{
                          background: 'var(--c-surface-2)',
                          borderTop:  i > 0 ? '1px solid var(--c-divider)' : undefined,
                        }}>

                        {/* Status dot */}
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'animate-pulse' : ''}`}
                          style={{ background: isOnline ? '#22c55e' : isBillingPaused ? '#ef4444' : '#6b7280' }} />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                              {a.agent_name?.trim() || 'Centinelia'}
                            </span>
                            {(() => { const pc = PLAN_COLORS[a.plan] ?? '#6b7280'; return (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: `${pc}18`, color: pc, border: `1px solid ${pc}30` }}>
                                {PLAN_LABELS[a.plan] ?? a.plan}
                              </span>
                            ); })()}
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: statusBg, color: statusColor }}>
                              {statusLabel}
                            </span>
                            {a.outbound_role && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.15)' }}>
                                {OUTBOUND_ROLE_LABELS[a.outbound_role] ?? a.outbound_role}
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--c-text-3)' }}>
                            <Phone size={10} />
                            {a.phone_number ?? <span style={{ fontStyle: 'italic' }}>Sin número asignado</span>}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!isCurrent && (
                            <Link
                              href={`/portal/${a.portal_token}`}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                              style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
                              Ver portal
                            </Link>
                          )}
                          <Link
                            href={`/portal/${a.portal_token}/configurar`}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                            style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                            Configurar
                          </Link>
                          {!isBillingPaused
                            ? <PauseResumeButton agentId={a.id} clientPaused={isClientPaused} />
                            : (
                              <a
                                href={`/api/billing/portal-session?token=${a.portal_token}`}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                                Resolver pago →
                              </a>
                            )
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── NEGOCIO ──────────────────────────────────────────────────── */}
          {tab === 'negocio' && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Logo del negocio</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                  Aparece en el encabezado de tu portal de clientes.
                </p>
                <LogoUploader token={token} currentUrl={(agent as any).logo_url ?? null} />
              </div>

              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Sitio web</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                  Sincroniza tu sitio para que el agente tenga siempre la información actualizada de tu negocio.
                </p>
                <WebsiteSyncButton token={token} currentUrl={(agent as any).business_website ?? null} />
              </div>

              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Base de conocimiento general</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                  Todo lo que el agente debe saber sobre tu negocio: servicios, precios, horarios, políticas, FAQs. Se usa tanto en llamadas entrantes como en llamadas salientes.
                </p>
                <KnowledgeBaseEditor token={token} initialValue={(agent as any).knowledge_base ?? ''} />
              </div>

              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Horario de atención</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                  Define los días y horarios en que tu agente está disponible para atender llamadas.
                </p>
                <BusinessHoursEditor token={token} initialHours={(agent.business_hours ?? null) as BusinessHours | null} />
              </div>

              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reseñas de tu negocio</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                  El agente envía este link a tus clientes por WhatsApp al finalizar llamadas exitosas para que dejen una reseña.
                </p>
                <ReviewLinkEditor token={token} initialValue={(agent as any).google_review_url ?? ''} />
              </div>

            </div>
          )}

          {/* ── CORREOS ──────────────────────────────────────────────────── */}
          {tab === 'correos' && (
            <div className="flex flex-col gap-5">
              <EmailSettings token={token} />
            </div>
          )}

          {/* ── EQUIPO ───────────────────────────────────────────────────── */}
          {tab === 'equipo' && (
            <div className="flex flex-col gap-8">
              <TeamFeed token={token} />
              <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: '2rem' }}>
                <LearningsSection token={token} />
              </div>
            </div>
          )}

          {/* ── ENTRANTES ────────────────────────────────────────────────── */}
          {tab === 'entrantes' && (
            <div className="flex flex-col gap-5">
              {/* KPI strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard icon={<PhoneCall size={16} color="#6C3BFF" />} value={String(calls.length)} label="Llamadas" sub={`prom. ${avgDuration} min`} valueColor="#6C3BFF" accentColor="#6C3BFF" />
                <KpiCard icon={<Clock size={16} color="#6b7280" />} value={`${totalHours}h`} label="Tiempo atendido" valueColor="var(--c-text)" accentColor="#6b7280" />
                {showLeads && leads.length > 0 && <KpiCard icon={<Users size={16} color="#22c55e" />} value={String(leads.length)} label="Leads" sub={`${calls.length > 0 ? Math.round((leads.length / calls.length) * 100) : 0}% conv.`} valueColor="#22c55e" accentColor="#22c55e" />}
              </div>

              {/* Call list */}
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
                    <PhoneCall size={13} /> Llamadas recientes
                  </h2>
                  <DownloadCallsCSV calls={calls} filename={`llamadas-${agent.business_name.replace(/\s+/g, '-').toLowerCase()}.csv`} />
                </div>
                {calls.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                      <PhoneCall size={20} style={{ color: '#6C3BFF', opacity: 0.5 }} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin llamadas todavía</p>
                    <p className="text-xs text-center px-8" style={{ color: 'var(--c-text-3)' }}>
                      En cuanto llegue la primera llamada aparecerá aquí automáticamente.
                    </p>
                  </div>
                ) : (
                  <CallsSearch calls={calls as any} isPro={agent.plan === 'pro'} callerNames={callerNames} />
                )}
              </div>
            </div>
          )}

          {/* ── RESUMEN ──────────────────────────────────────────────────── */}
          {tab === 'resumen' && (
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

              {/* Period filter — first, affects all numbers below */}
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Período:</span>
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  {[{ label: '7 días', param: '7' }, { label: '30 días', param: '30' }, { label: 'Todo', param: '' }].map(({ label, param }) => {
                    const active = (period ?? '') === param;
                    return (
                      <Link key={param} href={param ? `/portal/${token}?tab=resumen&period=${param}` : `/portal/${token}?tab=resumen`}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ background: active ? '#6C3BFF' : 'transparent', color: active ? '#fff' : 'var(--c-text-3)' }}>
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* KPI cards */}
              <div className={`grid ${kpiGridClass} gap-3`}>
                <KpiCard icon={<PhoneCall size={16} color="#6C3BFF" />}     value={String(calls.length)}        label="Llamadas"        sub={`prom. ${avgDuration} min`}                                                                                  valueColor="#6C3BFF"       accentColor="#6C3BFF"  />
                <KpiCard icon={<Clock size={16} color="#6b7280" />}         value={`${totalHours}h`}            label="Tiempo atendido"                                                                                                                   valueColor="var(--c-text)" accentColor="#6b7280"  />
                {showLeads   && leads.length  > 0 && <KpiCard icon={<Users size={16} color="#22c55e" />}         value={String(leads.length)}  label="Leads"    sub={calls.length > 0 ? `${Math.round((leads.length / calls.length) * 100)}% conv.` : undefined} valueColor="#22c55e"  accentColor="#22c55e"  />}
                {showOrders  && orders.length > 0 && <KpiCard icon={<ShoppingBag size={16} color="#f59e0b" />}   value={String(orders.length)} label="Pedidos"  sub={pendingOrders > 0 ? `${pendingOrders} pendientes` : undefined}                      valueColor="#f59e0b"  accentColor="#f59e0b"  />}
                {showAppts   && appts.length  > 0 && <KpiCard icon={<CalendarDays size={16} color="#3b82f6" />}  value={String(appts.length)}  label="Citas"    sub={confirmedAppts > 0 ? `${confirmedAppts} confirmadas` : undefined}                   valueColor="#3b82f6"  accentColor="#3b82f6"  />}
                {showOutbound && outboundCallCount > 0 && <KpiCard icon={<PhoneOutgoing size={16} color="#a855f7" />} value={String(outboundCallCount)} label="Salientes"                                                                                 valueColor="#a855f7"  accentColor="#a855f7"  />}
              </div>

              {/* Peak hours */}
              {calls.length > 0 && (
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                    Horas pico
                  </h2>
                  <PeakHoursChart hourCounts={hourCounts} />
                </div>
              )}

              {/* Activity feed */}
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
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

              {/* Outbound snapshot */}
              {showOutbound && (
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
                      <PhoneOutgoing size={13} /> Salientes
                    </h2>
                    <Link href={`/portal/${token}?tab=salientes`}
                      className="text-xs transition-opacity hover:opacity-70"
                      style={{ color: '#9B6DFF' }}>
                      Ver salientes →
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StatBox label="Campañas activas"     value={String(activeOutboundCampaigns)} />
                    <StatBox label="Contactos pendientes" value={String(pendingOutboundCount)}    />
                    <StatBox label="Última ejecución"     value={lastCampaignRunAt ? fmtRelative(lastCampaignRunAt) : 'Nunca'} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ACTIVIDAD ────────────────────────────────────────────────── */}
          {tab === 'actividad' && (
            <div className="flex flex-col gap-5">
              {!showLeads && !showOrders && !showAppts ? (
                /* Features not enabled for this agent */
                <div className="flex flex-col items-center py-12 gap-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="relative" style={{ width: 140, height: 200 }}>
                    <Image src="/agent-duo-stand.png" alt="" fill sizes="140px"
                      style={{ objectFit: 'contain', objectPosition: 'bottom' }} />
                  </div>
                  <div className="text-center px-8">
                    <p className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>Captura de leads, citas y pedidos no está activa</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>Estas funciones se habilitan según la configuración de tu agente.</p>
                  </div>
                </div>
              ) : (() => {
                const visibleSections = (
                  [
                    showOrders && orders.length > 0 && { count: orders.length, el: (
                      <CollapsibleSection key="orders" title="Pedidos" icon={<ShoppingBag size={14} />} defaultOpen count={orders.length}>
                        <PortalOrdersSection initialOrders={orders as any} token={token} isPro={agent.plan === 'pro'} />
                      </CollapsibleSection>
                    )},
                    showAppts && appts.length > 0 && { count: appts.length, el: (
                      <CollapsibleSection key="appts" title="Citas" icon={<CalendarDays size={14} />} defaultOpen count={appts.length}>
                        <PortalAppointmentsSection initialAppointments={appts as any} token={token} label="cita" isPro={agent.plan === 'pro'} />
                      </CollapsibleSection>
                    )},
                    showLeads && leads.length > 0 && { count: leads.length, el: (
                      <CollapsibleSection key="leads" title="Leads" icon={<Users size={14} />} defaultOpen count={leads.length}>
                        <PortalLeadsSection initialLeads={leads as any} token={token} isPro={agent.plan === 'pro'}
                          filename={`leads-${agent.business_name.replace(/\s+/g, '-').toLowerCase()}.csv`} />
                      </CollapsibleSection>
                    )},
                  ] as ({ count: number; el: React.ReactNode } | false)[]
                ).filter((s): s is { count: number; el: React.ReactNode } => !!s)
                 .sort((a, b) => b.count - a.count);

                if (visibleSections.length === 0) return (
                  /* Features enabled, no data yet */
                  <div className="flex flex-col items-center py-12 gap-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <div className="relative" style={{ width: 72, height: 100 }}>
                      <Image src="/agent-f2.png" alt="" fill sizes="72px"
                        style={{ objectFit: 'contain', objectPosition: 'bottom' }} />
                    </div>
                    <div className="text-center px-8">
                      <p className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>Aún no hay actividad registrada</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>Los leads, citas y pedidos que el agente capture aparecerán aquí.</p>
                    </div>
                  </div>
                );

                return (
                  <>
                    <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Todos los registros desde el inicio</p>
                    {visibleSections.map(s => s.el)}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── MINUTOS ──────────────────────────────────────────────────── */}
          {tab === 'minutos' && (
            <div className="flex flex-col gap-5">
              {/* Usage card */}
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

              {/* AI Ops */}
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

              {/* Averages */}
              {allCalls.length > 0 && (
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Consumo promedio</h2>
                  <div className="grid grid-cols-3 gap-3">
                    <StatBox label="Por día"   value={`${avgMinPerDay} min`} />
                    <StatBox label="Por semana" value={`${avgMinPerWeek} min`} />
                    <StatBox label="Por mes"    value={`${avgMinPerMonth} min`} highlight={avgMinPerMonth > minutesIncluded * 0.9} />
                  </div>
                  <p className="text-xs mt-3" style={{ color: 'var(--c-text-4)' }}>Histórico: {allTimeTotalMin} min en {daysSinceFirst} días</p>
                </div>
              )}

              {/* Buy extra — border/urgency scales with usage */}
              <div className="rounded-xl p-5" style={{
                background:       minutesPct >= 70 ? 'rgba(108,59,255,0.03)' : 'var(--c-surface)',
                border:           minutesPct >= 90 ? '1px solid rgba(239,68,68,0.35)' : minutesPct >= 70 ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border-2)',
                backdropFilter:   'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
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
              </div>

              {/* Auto-refill */}
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Recarga automática</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Recarga tu saldo automáticamente cuando bajen de un umbral.</p>
                <AutoRefillSection token={token} />
              </div>

              {/* Cambiar plan */}
              {agent.plan && (
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Cambiar plan</h2>
                  <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Sube o baja de tier según las necesidades de tu negocio.</p>
                  <UpgradePlanSection token={token} currentPlan={agent.plan as Plan} currentTier={(agent as any).minutes_plan ?? 'starter'} />
                </div>
              )}

              {/* Facturación */}
              {hasStripe && (
                <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Facturación</h2>
                  <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Actualiza tu método de pago, descarga facturas o cancela tu suscripción.</p>
                  <a
                    href={`/api/billing/portal-session?token=${token}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
                    style={{ background: 'rgba(108,59,255,0.15)', border: '1px solid rgba(108,59,255,0.3)', color: '#C4A8FF', textDecoration: 'none' }}
                  >
                    Portal de facturación →
                  </a>
                </div>
              )}

              {/* Ledger */}
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
          )}

          {/* ── SALIENTES ────────────────────────────────────────────────── */}
          {tab === 'salientes' && (
            <div className="flex flex-col gap-6">
              <OutboundToggles
                token={token}
                initOutbound={!!(agent.features as any)?.outbound_calls}
                initMissedCallRecovery={!!(agent as any).missed_call_recovery}
              />
              {(agent.features as any)?.outbound_calls && (
                <>
                  <OutboundSection
                    token={token}
                    initialContacts={contactOutbound as any[]}
                    initialCampaigns={outboundCampaigns as any[]}
                    agents={allClientAgents
                      .filter(a => !!(a.features as any)?.outbound_calls)
                      .map(a => ({ id: a.id, agent_name: a.agent_name ?? null, business_name: a.business_name }))}
                  />
                </>
              )}
            </div>
          )}

          {/* ── INTEGRACIONES ────────────────────────────────────────────── */}
          {tab === 'integraciones' && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Calendario</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
                  Cal.com crea la cita directamente durante la llamada. Calendly y Google Calendar envían el link de reserva al cliente por WhatsApp.
                </p>
                <IntegrationsSection token={token} plan={agent.plan as Plan} />
              </div>
            </div>
          )}

          {/* ── CONTRATO ─────────────────────────────────────────────────── */}
          {tab === 'contrato' && (
            <ContractSection
              token={token}
              businessName={agent.business_name}
              signedAt={agent.contract_accepted_at ?? null}
              contractPreviewUrl={`/portal/${token}/contrato`}
            />
          )}
        </div>

        {/* Footer */}
        <div className="mt-1 px-4 sm:px-6 pt-2 pb-20 sm:pb-4" style={{ borderTop: '1px solid var(--c-border)', position: 'relative', zIndex: 1 }}>

          {/* Review badge, absolute in the pb space, same pattern as landing footer */}
          {centineliReviewUrl && (
            <a
              href={centineliReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden flex items-center gap-1.5 rounded-full text-[11px] whitespace-nowrap"
              style={{
                position:             'absolute',
                bottom:               25,
                left:                 '50%',
                transform:            'translateX(-50%)',
                padding:              '6px 14px',
                background:           'var(--c-surface)',
                border:               '1px solid var(--c-border)',
                boxShadow:            '0 2px 12px rgba(0,0,0,0.18)',
                color:                'var(--c-text-3)',
                textDecoration:       'none',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              ¿Qué tal funciona Centinelia?
            </a>
          )}

          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {supportWhatsApp && (
                <a href={`https://wa.me/${supportWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent('¡Hola! Quiero saber cómo puedo contratar un agente 24/7 para mi negocio.')}`} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                  style={{ background: '#22c55e', color: '#fff', flexShrink: 0 }}
                  aria-label="WhatsApp">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </a>
              )}
              <a href={`mailto:${supportEmail}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
                style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)', flexShrink: 0 }}
                aria-label="Soporte">
                <Mail size={14} />
              </a>
            </div>
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              Powered by{' '}
              <a href="https://pneumastudio.mx" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--c-text-4)' }} className="hover:opacity-80 transition-opacity">
                Pneuma Studio
              </a>
            </span>
          </div>
        </div>

        <SupportChat />
        <LiveNotifications token={token} />
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
