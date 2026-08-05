export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, CheckCircle, XCircle, PhoneCall, PhoneOutgoing, Users, ShoppingBag, CalendarDays, MessageCircle, AlertTriangle, ChevronRight, Clock, Zap } from 'lucide-react';
import { MonthReportPicker } from './MonthReportPicker';
import type { BusinessHours } from '@/types/agent';
// Phone, CheckCircle, XCircle still used in Agentes tab and alerts
import type { VoiceCall } from '@/types/agent';
import { MINUTES_TIER_CONFIG } from '@/lib/billing/plans';
import type { MinutesTier } from '@/lib/billing/plans';
import { ThemeProvider } from '@/components/ThemeProvider';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { redirect } from 'next/navigation';

import PortalLogout            from './PortalLogout';
import BrandKitEditor          from './BrandKitEditor';
import EmailSettings            from './EmailSettings';
import BusinessSwitcher        from './BusinessSwitcher';
import PortalLeadsSection      from './PortalLeadsSection';
import PortalOrdersSection     from './PortalOrdersSection';
import PortalAppointmentsSection from './PortalAppointmentsSection';
import BuyMinutesSection       from './BuyMinutesSection';
import BuyOpsSection           from './BuyOpsSection';
import AnnualContractCallout   from './AnnualContractCallout';
import MinutesLedgerSection    from './MinutesLedgerSection';
import CallCard                from './CallCard';
import DownloadCallsCSV        from './DownloadCallsCSV';
import CollapsibleSection      from './CollapsibleSection';
import PeakHoursChart          from './PeakHoursChart';
import NotificationBell        from './NotificationBell';
import PortalFooter            from './PortalFooter';

import CallsSearch             from './CallsSearch';
import PortalTabNav           from './PortalTabNav';
import PortalSidebar          from './PortalSidebar';
import PortalShell            from './PortalShell';
import { isPortalV2Enabled }  from '@/lib/portal/portal-v2-flag';
import { PageContainer, PageSection, GridStretch, SectionHeader, Card } from '@/components/portal-ui';
import KnowledgeBaseEditor    from './KnowledgeBaseEditor';
import OwnerProfileEditor     from './OwnerProfileEditor';
import WebsiteSyncButton      from './WebsiteSyncButton';
import ReviewLinkEditor       from './ReviewLinkEditor';
import BusinessHoursEditor    from './BusinessHoursEditor';
import PortalContactsSection     from './PortalContactsSection';
import OutboundSection           from './OutboundSection';
import OutboundToggles           from './OutboundToggles';
import AutoRefillSection         from './AutoRefillSection';
import { inboxAddressFor }       from '@/lib/email/inbox';
import IntegrationsHub           from './IntegrationsHub';
import PoliciesSection          from './PoliciesSection';
import OrgCard                  from './OrgCard';
import ContractTrackerSection   from './ContractTrackerSection';
import InfoTooltip              from '@/components/InfoTooltip';
import AccountSerialBadge       from './AccountSerialBadge';
import InsightsSection          from './InsightsSection';
import { BriefDelDiaCard }      from './BriefDelDiaCard';
import { getOrCreateSerial }    from '@/lib/portal/serial';
import type { OutboundCall }     from './PortalOutboundSection';
import type { ContactVoiceLead, ContactOutbound } from './PortalContactsSection';

type Tab = 'inicio' | 'llamadas' | 'salientes' | 'oficina' | 'agentes' | 'negocio' | 'integraciones' | 'cuenta' | 'equipo';

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
  escalated_whatsapp: { label: 'Escalada',   color: '#16a34a', bg: 'rgba(22,163,74,0.1)'    },
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

  if (tab === 'oficina')                          redirect(`/portal/${token}/oficina`);
  if (tab === 'agentes')                          redirect(`/portal/${token}/agentes`);
  if (tab === 'llamadas' || tab === 'salientes')  redirect(`/portal/${token}/llamadas`);
  if (tab === 'integraciones')                    redirect(`/portal/${token}/oficina/integraciones`);
  if (tab === 'equipo')                           redirect(`/portal/${token}/usuarios`);

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
        .select('id, business_name, agent_name, portal_token, active, client_paused, billing_status, plan, phone_number, logo_url, features, role, stripe_customer_id')
        .eq('portal_email', lookupEmail)
    : { data: [] };
  const allClientAgents = clientAgents ?? [];

  // Org-level settings — single source of truth for the Negocio tab
  const { data: orgSettings } = agent.portal_email
    ? await supabase
        .from('organizations')
        .select('knowledge_base, owner_profile, business_description, business_hours, business_website, website_knowledge, google_review_url, email_brand_color, brand_color_secondary, brand_website, brand_address, email_footer_text, billing_model')
        .eq('portal_email', agent.portal_email)
        .single()
    : { data: null };

  // Anual: si la org está en contrato prepagado, esconde botones Stripe (compra
  // minutos/tareas/plan) y muestra callout. Fetch contract info sólo si aplica.
  const billingModel = (orgSettings?.billing_model as string | null) ?? 'stripe';
  const isAnnualOrExpired = billingModel === 'annual_prepaid' || billingModel === 'expired';
  let annualContractInfo: { folio: string; endDate: string; isExpired: boolean } | null = null;
  if (isAnnualOrExpired && agent.portal_email) {
    const { data: latestContract } = await supabase
      .from('annual_contracts')
      .select('contract_folio, end_date')
      .eq('organization_email', agent.portal_email)
      .in('status', ['active', 'expired'])
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestContract) {
      annualContractInfo = {
        folio:     latestContract.contract_folio as string,
        endDate:   latestContract.end_date as string,
        isExpired: billingModel === 'expired',
      };
    }
  }

  // Agents with outbound calling enabled — available to select when scheduling
  const outboundAgents = allClientAgents
    .filter(a => {
      const f = (a as any).features ?? {};
      return !!f.outbound_calls;
    })
    .map(a => ({
      token: a.portal_token,
      name:  (a.agent_name?.trim() || 'Centinelia'),
      role:  ((a as any).features as any)?.outbound_role ?? undefined,
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
  // Flags de layout de Inicio: agregar features de TODOS los empleados de la
  // cuenta (org-scoped), no solo del agente cuyo token está en la URL. Antes:
  // el layout cambiaba al alternar entre Sofia/Nox aunque la cuenta fuera la
  // misma. Ver [[issue-inicio-layout-agent-scoped]].
  const orgFeatureFlags = (allClientAgents as Array<{ features?: Record<string, unknown> | null }>).reduce(
    (acc, a) => {
      const f = a.features ?? {};
      return {
        lead_qualification:  acc.lead_qualification  || !!f.lead_qualification,
        order_taking:        acc.order_taking        || !!f.order_taking,
        appointment_booking: acc.appointment_booking || !!f.appointment_booking,
        outbound_calls:      acc.outbound_calls      || !!f.outbound_calls,
      };
    },
    { lead_qualification: false, order_taking: false, appointment_booking: false, outbound_calls: false },
  );
  const showLeads     = orgFeatureFlags.lead_qualification;
  const showOrders    = orgFeatureFlags.order_taking;
  const showAppts     = orgFeatureFlags.appointment_booking;
  const showOutbound  = orgFeatureFlags.outbound_calls;
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
    ? await supabase.from('voice_agents').select('id, ai_ops_used, ai_ops_limit').eq('portal_email', agent.portal_email)
    : { data: null };
  const aiOpsUsed  = (opsAgents ?? []).reduce((s, a) => s + (((a as any).ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit = (opsAgents ?? []).reduce((s, a) => s + (((a as any).ai_ops_limit as number) ?? 0), 0);
  const aiOpsPct   = aiOpsLimit > 0 ? Math.min((aiOpsUsed / aiOpsLimit) * 100, 100) : 0;
  const aiOpsColor = aiOpsPct > 90 ? '#ef4444' : aiOpsPct > 70 ? '#f59e0b' : '#22c55e';

  const supportWhatsApp    = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';
  const supportEmail       = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
  const centineliReviewUrl = process.env.NEXT_PUBLIC_CENTINELIA_REVIEW_URL ?? '';

  const accountSerial = agent.portal_email
    ? await getOrCreateSerial(agent.portal_email).catch(() => null)
    : null;

  // ── Data per tab ───────────────────────────────────────────────────────────
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  // Inicio and stats are account-level — include all sibling agents
  const agentIdsForCalls = allClientAgents.length > 0
    ? allClientAgents.map(a => a.id)
    : [agent.id];

  const [callsRes, leadsRes, ordersRes, apptsRes, allCallsRes, outboundRes, contactLeadsRes, contactOutboundRes, outboundCampaignsRes, emailIntsRes] = await Promise.all([
    // Calls — account-level for Inicio activity and Llamadas
    since
      ? supabase.from('voice_calls').select('*').in('agent_id', agentIdsForCalls).gte('created_at', since).order('created_at', { ascending: false }).limit(100)
      : supabase.from('voice_calls').select('*').in('agent_id', agentIdsForCalls).order('created_at', { ascending: false }).limit(100),
    showLeads  ? supabase.from('leads_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showOrders ? supabase.from('orders_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showAppts  ? supabase.from('appointments_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('voice_calls').select('duration_seconds, created_at').in('agent_id', agentIdsForCalls).order('created_at', { ascending: true }),
    showOutbound ? supabase.from('outbound_calls').select('*').eq('agent_id', agent.id).order('scheduled_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    // Contacts tab
    supabase.from('leads_voice').select('id, nombre, whatsapp, telefono, email, servicio, presupuesto, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
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
  const contactOutbound   = (contactOutboundRes.data ?? []) as ContactOutbound[];
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

  // Ops averages — based on current-month usage and days elapsed since last reset
  const daysSinceReset = (() => {
    if (!minutesResetDate) return 1;
    const d = new Date(minutesResetDate + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    while (d < today) d.setMonth(d.getMonth() + 1);
    const lastReset = new Date(d); lastReset.setMonth(lastReset.getMonth() - 1);
    return Math.max(1, Math.ceil((today.getTime() - lastReset.getTime()) / 86400000));
  })();
  const avgOpsPerDay   = aiOpsUsed > 0 ? (aiOpsUsed / daysSinceReset).toFixed(1) : '0';
  const avgOpsPerWeek  = aiOpsUsed > 0 ? Math.round(aiOpsUsed / (daysSinceReset / 7)) : 0;
  const avgOpsPerMonth = aiOpsUsed > 0 ? Math.round(aiOpsUsed / (daysSinceReset / 30)) : 0;

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
      sub:        callOutcomeDesc(c.outcome as string),
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
  const hasNox      = (allClientAgents as any[]).some(
    (a: any) => (a.features as any)?.meerkat_role_id === 'nox' && a.active,
  );

  // Portal V2 flag — orgId is portal_email (primary key of organizations)
  const v2Enabled = agent.portal_email
    ? await isPortalV2Enabled(agent.portal_email)
    : false;

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

  // Per-agent call counts for "Tu equipo hoy"
  const callsByAgentId: Record<string, number> = {};
  for (const c of calls) {
    const aid = (c as any).agent_id as string;
    if (aid) callsByAgentId[aid] = (callsByAgentId[aid] ?? 0) + 1;
  }

  const opsById: Record<string, number> = {};
  for (const a of opsAgents ?? []) {
    opsById[(a as any).id as string] = ((a as any).ai_ops_used as number) ?? 0;
  }

  const teamToday = allClientAgents.map(a => ({
    name:   a.agent_name?.trim() || 'Empleado',
    role:   ((a as any).role?.trim() as string | null) ?? null,
    color:  (((a as any).features as any)?.role_color as string) ?? '#6C3BFF',
    calls:  callsByAgentId[a.id] ?? 0,
    ops:    opsById[a.id] ?? 0,
    active: !!(a.active) && !((a as any).client_paused) && a.billing_status !== 'pago_fallido',
    token:  a.portal_token as string,
  }));

  const RESOLVED_OUTCOMES = new Set(['info_provided', 'lead_created', 'appointment_booked', 'order_taken', 'escalated_whatsapp', 'other']);
  const resolvedCount  = calls.filter(c => RESOLVED_OUTCOMES.has((c.outcome as string) ?? '')).length;
  const autonomousRate = calls.length > 0 ? Math.round((resolvedCount / calls.length) * 100) : 0;

  const agentTimezone = ((agent as any).timezone as string | null) ?? 'America/Monterrey';
  const localHourStr  = new Date().toLocaleString('en-US', { timeZone: agentTimezone, hour: 'numeric', hour12: false });
  const localHour     = parseInt(localHourStr) || 12;
  const greeting      = localHour < 12 ? 'Buenos días' : localHour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const officeOk      = !!(agent.active) && !clientPaused && !billingPaused;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'inicio',   label: 'Inicio' },
    { id: 'negocio',  label: 'Organización' },
    { id: 'agentes',  label: 'Empleados' },
    { id: 'oficina',  label: 'Oficina' },
    { id: 'cuenta',   label: 'Cuenta' },
    { id: 'equipo',   label: 'Equipo de gestión' },
  ];

  // V1 main content column — used by the V1 layout unchanged
  const pageBodyV1 = (
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
                  Tu empleado está pausado por falta de pago. Actualiza tu método de pago o contacta a Centinelia.
                </p>
              </div>
            )}
            {clientPaused && !billingPaused && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <AlertTriangle size={15} color="#fbbf24" className="flex-shrink-0" />
                <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                  Tu empleado está pausado voluntariamente. Puedes reanudarlo cuando quieras desde la pestaña Resumen.
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
        <div className={`flex-1 px-4 sm:px-6 py-6 w-full md:mx-0 ${tab === 'negocio' ? '' : tab === 'inicio' || tab === 'cuenta' ? 'max-w-6xl' : 'max-w-4xl'}`} style={{ position: 'relative', zIndex: 1 }}>

          {/* ── INICIO (dashboard) ───────────────────────────────────────── */}
          {tab === 'inicio' && (
            <div className="flex flex-col gap-5">

              {/* Greeting banner */}
              <div className="rounded-xl px-5 py-4"
                style={{ background: officeOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${officeOk ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: officeOk ? '#22c55e' : '#ef4444', boxShadow: officeOk ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }} />
                  <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                    <span className="font-semibold">{greeting}, {agent.business_name}.</span>{' '}
                    <span style={{ color: 'var(--c-text-2)' }}>
                      {officeOk ? 'Tu oficina está activa y atendiendo.' : 'Tu oficina está pausada en este momento.'}
                    </span>
                  </p>
                </div>
              </div>

              {isFirstTime && (
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(108,59,255,0.06)',
                    border:     '1px solid rgba(108,59,255,0.15)',
                    minHeight:  96,
                  }}
                >
                  <div style={{ position: 'absolute', bottom: 0, left: 16, width: 160, height: 112, pointerEvents: 'none' }}>
                    <Image src="/meerkats-team.png" alt="" fill sizes="160px"
                      style={{ objectFit: 'contain', objectPosition: 'bottom left' }} />
                  </div>
                  <div style={{ paddingLeft: 196, paddingRight: 20, minHeight: 96, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#6C3BFF' }}>Tu equipo está listo</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
                      En cuanto llegue la primera llamada, los registros aparecerán aquí automáticamente.
                    </p>
                  </div>
                </div>
              )}

              {/* Contract gate notice */}
              {!agent.contract_accepted_at && (
                <a href={`/portal/${token}/configurar#contrato`}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 no-underline transition-opacity hover:opacity-90"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <p className="flex-1 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
                    Tienes un contrato de servicios pendiente de firma.
                  </p>
                  <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#f59e0b' }}>Firmar ahora</span>
                  <ChevronRight size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                </a>
              )}

              {/* Reauth alerts — mobile strip */}
              {reauthAlerts.length > 0 && (
                <div className="flex flex-col gap-2 lg:hidden">
                  {reauthAlerts.map(alert => (
                    <Link key={alert.provider}
                      href={`/portal/${token}/oficina/integraciones`}
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
                  <KpiCard icon={<PhoneCall size={16} color="#6C3BFF" />}    value={String(calls.length)}   label="Conversaciones"   sub={`prom. ${avgDuration} min`}                                                                                   valueColor="#6C3BFF"  accentColor="#6C3BFF"  />
                  <KpiCard icon={<CheckCircle size={16} color="#22c55e" />}  value={String(resolvedCount)}  label="Sin intervención" sub={calls.length > 0 ? `${autonomousRate}% del total` : undefined}                                                valueColor="#22c55e"  accentColor="#22c55e"  />
                  {showLeads   && leads.length  > 0 && <KpiCard icon={<Users size={16} color="#22c55e" />}         value={String(leads.length)}  label="Leads"    sub={calls.length > 0 ? `${Math.round((leads.length / calls.length) * 100)}% conv.` : undefined} valueColor="#22c55e"  accentColor="#22c55e"  />}
                  {showOrders  && orders.length > 0 && <KpiCard icon={<ShoppingBag size={16} color="#f59e0b" />}   value={String(orders.length)} label="Pedidos"  sub={pendingOrders > 0 ? `${pendingOrders} pendientes` : undefined}                      valueColor="#f59e0b"  accentColor="#f59e0b"  />}
                  {showAppts   && appts.length  > 0 && <KpiCard icon={<CalendarDays size={16} color="#3b82f6" />}  value={String(appts.length)}  label="Citas"    sub={confirmedAppts > 0 ? `${confirmedAppts} confirmadas` : undefined}                   valueColor="#3b82f6"  accentColor="#3b82f6"  />}
                  {showOutbound && outboundCallCount > 0 && <KpiCard icon={<PhoneOutgoing size={16} color="#a855f7" />} value={String(outboundCallCount)} label="Salientes"                                                                                 valueColor="#a855f7"  accentColor="#a855f7"  />}
                  {showOps && <KpiCard icon={<Zap size={16} color="#06b6d4" />} value={String(aiOpsUsed)} label="Tareas" sub={`de ${aiOpsLimit} disponibles`} valueColor="#06b6d4" accentColor="#06b6d4" />}
                </div>

                {/* Autonomous resolution rate */}
                {calls.length > 0 && (
                  <p className="text-sm -mt-1" style={{ color: 'var(--c-text-2)' }}>
                    Tu oficina resolvió el{' '}
                    <span className="font-semibold" style={{ color: '#22c55e' }}>{autonomousRate}%</span>
                    {' '}de las solicitudes sin intervención humana.
                  </p>
                )}

                {/* Brief del día — solo cuando hay Nox activo en el equipo */}
                {hasNox && <BriefDelDiaCard />}

                {/* Tu equipo hoy */}
                {teamToday.length > 0 && (
                  <div id="equipo-hoy" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Tu equipo hoy</h2>
                    <div className="flex flex-col">
                      {teamToday.map((m, idx) => (
                        <div key={m.token}
                          className="flex items-center gap-3 py-2.5"
                          style={{ borderBottom: idx < teamToday.length - 1 ? '1px solid var(--c-divider)' : 'none' }}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: m.active ? '#22c55e' : '#9ca3af', boxShadow: m.active ? '0 0 5px #22c55e' : 'none' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{m.name}</p>
                            {m.role && <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{m.role}</p>}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 text-xs" style={{ color: 'var(--c-text-3)' }}>
                            {m.calls > 0 && (
                              <span className="flex items-center gap-1">
                                <PhoneCall size={11} style={{ color: '#6C3BFF' }} /> {m.calls}
                              </span>
                            )}
                            {m.ops > 0 && (
                              <span className="flex items-center gap-1">
                                <Zap size={11} style={{ color: '#06b6d4' }} /> {m.ops}
                              </span>
                            )}
                          </div>
                          <Link href={`/portal/${m.token}/configurar`}
                            className="text-xs transition-opacity hover:opacity-70 flex-shrink-0"
                            style={{ color: '#9B6DFF' }}>
                            Ver →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Insights de la semana */}
                <InsightsSection token={token} />

                {/* Activity feed */}
                <div id="actividad" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                    Actividad reciente
                  </h2>
                  {resumenFeed.length === 0 ? (
                    <div className="flex flex-col items-center py-8 gap-0">
                      <div className="relative" style={{ width: 96, height: 132 }}>
                        <Image src="/agent-f2.png" alt="" fill sizes="96px"
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

                {/* Actividad de tu oficina — chart, after feed */}
                {calls.length > 0 && (
                  <div id="horas-pico" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                      Actividad de tu oficina
                    </h2>
                    <PeakHoursChart hourCounts={hourCounts} />
                  </div>
                )}

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
                  {agentContextCards.some(a => a.tokens > 0) ? (
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
                                {a.tokens >= 1000 ? `${(a.tokens / 1000).toFixed(1)}k` : a.tokens} mem
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center gap-2 py-2">
                      <p className="text-xs" style={{ color: 'var(--c-text-3)', lineHeight: 1.6 }}>
                        Tu empleado aún no tiene instrucciones ni manual configurados. Agrégalos para que aprenda tu organización.
                      </p>
                      <Link href={`/portal/${token}/empleados`}
                        className="text-xs font-semibold transition-opacity hover:opacity-70 mt-1"
                        style={{ color: '#9B6DFF' }}>
                        Configurar en Empleados →
                      </Link>
                    </div>
                  )}
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
                <div id="contexto" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Contexto de empleados</h2>
                    <InfoTooltip text="Cuánto contexto tiene cada empleado cargado en su memoria (manual de la organización + instrucciones del puesto + aprendizajes). A más memoria, más informado está el empleado." />
                  </div>
                  {agentContextCards.some(a => a.tokens > 0) ? (
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
                                {a.tokens >= 1000 ? `${(a.tokens / 1000).toFixed(1)}k` : a.tokens} mem
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center gap-2 py-1">
                      <p className="text-xs" style={{ color: 'var(--c-text-3)', lineHeight: 1.6 }}>
                        Tu empleado aún no tiene instrucciones ni manual configurados. Agrégalos para que aprenda tu organización.
                      </p>
                      <Link href={`/portal/${token}/empleados`}
                        className="text-xs font-semibold transition-opacity hover:opacity-70 mt-1"
                        style={{ color: '#9B6DFF' }}>
                        Configurar en Empleados →
                      </Link>
                    </div>
                  )}
                </div>

              </div>

              </div>
            </div>
          )}

          {/* ── OFICINA (ops only) ───────────────────────────────────────── */}
          {/* ── NEGOCIO ──────────────────────────────────────────────────── */}
          {tab === 'negocio' && (
            <div className="flex flex-col lg:flex-row gap-5 items-start">

              {/* Main column */}
              <div className="flex-1 min-w-0 flex flex-col gap-5">
                <div id="organizacion">
                  {agent.portal_email && (
                    <OrgCard token={token} portalEmail={agent.portal_email} logoUrl={(agent as any).logo_url ?? null} initialDescription={orgSettings?.business_description ?? (agent as any).business_description ?? ''} />
                  )}
                </div>

                <div id="branding" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Branding de documentos y correos</h2>
                    <InfoTooltip text="Define los colores, datos de contacto y pie de página que aparecen en todos los correos y documentos que genera tu empleado." />
                  </div>
                  <BrandKitEditor
                    token={token}
                    logoUrl={(agent as any).logo_url ?? null}
                    businessName={agent.business_name}
                    agentName={agent.agent_name ?? agent.business_name}
                    initialColor={orgSettings?.email_brand_color ?? (agent as any).email_brand_color ?? '#6C3BFF'}
                    initialColorSecondary={orgSettings?.brand_color_secondary ?? (agent as any).brand_color_secondary ?? ''}
                    initialWebsite={orgSettings?.brand_website ?? (agent as any).brand_website ?? ''}
                    initialAddress={orgSettings?.brand_address ?? (agent as any).brand_address ?? ''}
                    initialFooter={orgSettings?.email_footer_text ?? (agent as any).email_footer_text ?? ''}
                  />
                </div>

                <div id="conocimiento" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Manual de la organización</h2>
                    <InfoTooltip text="Tus empleados consultan esta información en todas sus interacciones: llamadas, correos y mensajes. Incluye servicios, precios, FAQs y cualquier detalle que deban conocer." />
                  </div>
                  <KnowledgeBaseEditor
                    token={token}
                    initialValue={orgSettings?.knowledge_base ?? (agent as any).knowledge_base ?? ''}
                    websiteSynced={!!(orgSettings?.website_knowledge ?? (agent as any).website_knowledge)}
                    hasDescription={!!((orgSettings?.business_description ?? (agent as any).business_description)?.trim())}
                  />
                </div>

                <div id="perfil-dueno" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Perfil del responsable</h2>
                    <InfoTooltip text="Cuéntale a tus empleados quién eres, cuáles son tus prioridades y cómo te gusta que se hagan las cosas. Cuanto más sepan de ti, mejor se adaptarán a tu estilo." />
                  </div>
                  <OwnerProfileEditor
                    token={token}
                    initialValue={orgSettings?.owner_profile ?? (agent as any).owner_profile ?? ''}
                  />
                </div>

                <div id="contratos-internos" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <ContractTrackerSection token={token} />
                </div>

              </div>

              {/* Col 2 — Sitio web, Reseñas, Notificaciones */}
              <div className="flex flex-col gap-5 w-full" style={{ flexBasis: 420, flexShrink: 0 }}>
                <div id="sitio" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Sitio web</h2>
                    <InfoTooltip text="Sincroniza tu sitio para que tu empleado tenga siempre la información actualizada de tu organización." />
                  </div>
                  <WebsiteSyncButton token={token} currentUrl={orgSettings?.business_website ?? (agent as any).business_website ?? null} />
                  <div style={{ borderTop: '1px solid var(--c-border)', margin: '20px -20px 16px' }} />
                  <div className="flex items-center gap-1.5 mb-3">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reseñas</h2>
                    <InfoTooltip text="Tu empleado comparte este link con tus clientes al finalizar llamadas exitosas para que dejen una reseña." />
                  </div>
                  <ReviewLinkEditor token={token} initialValue={orgSettings?.google_review_url ?? (agent as any).google_review_url ?? ''} />
                </div>

                <div id="dominio-correo" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Notificaciones automáticas al cliente</h2>
                    <InfoTooltip text="Cuando tu empleado atiende una llamada, Centinelia envía correos automáticos al cliente (confirmación de cita, acuse de lead, etc.). Por defecto salen desde centinelia.mx. Registra tu dominio para que lleguen desde tuempresa.com." />
                  </div>
                  <EmailSettings token={token} />
                </div>
              </div>

              {/* Col 3 — Horario de atención */}
              <div className="flex flex-col gap-5 w-full" style={{ flexBasis: 280, flexShrink: 0 }}>
                <div id="horarios" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                  <div className="flex items-center gap-1.5 mb-4">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Horario de atención</h2>
                    <InfoTooltip text="Define los días y horarios en que tu empleado está disponible para atender llamadas." />
                  </div>
                  <BusinessHoursEditor token={token} initialHours={((orgSettings?.business_hours ?? agent.business_hours) ?? null) as BusinessHours | null} />
                </div>
              </div>

            </div>
          )}

          {/* ── CUENTA ───────────────────────────────────────────────────── */}
          {tab === 'cuenta' && (
            <div className="flex flex-col gap-5">

              {/* Contract gate banner */}
              {!agent.contract_accepted_at && (
                <a href={`/portal/${token}/configurar#contrato`} className="flex items-start gap-3 rounded-xl px-4 py-3.5 no-underline transition-opacity hover:opacity-90"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)' }}>
                  <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#92400e' }}>Contrato pendiente de firma</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                      Revisa y firma el contrato de servicios para formalizar el uso de tu empleado digital. Ve a Configurar tu empleado para firmarlo.
                    </p>
                  </div>
                  <ChevronRight size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                </a>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px_300px] gap-5 items-start">

                {/* ── Col 1: Uso + Compras + Recarga ── */}
                <div className="flex flex-col gap-5" id="minutos" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>

                  {/* ── Uso del mes: minutos + tareas en una sola tarjeta ── */}
                  {(minutesIncluded > 0 || aiOpsLimit > 0) && (
                    <div id="uso-del-mes" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Uso del mes</h2>
                      <div className="flex flex-col gap-4">
                        {minutesIncluded > 0 && (
                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>Minutos</span>
                              <span style={{ color: minutesColor }}>{minutesUsed} / {minutesIncluded} min</span>
                            </div>
                            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                              <div className="h-2 rounded-full transition-all" style={{ width: `${minutesPct}%`, background: minutesColor }} />
                            </div>
                            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                              <span>{minutesRemain} disponibles</span>
                              <span>Renueva el {resetDate}</span>
                            </div>
                            {rolloverMinutes > 0 && (
                              <p className="text-xs mt-1" style={{ color: '#6C3BFF' }}>{planBaseMinutes} base + {rolloverMinutes} del mes anterior</p>
                            )}
                          </div>
                        )}
                        {aiOpsLimit > 0 && (
                          <div>
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>Tareas</span>
                              <span style={{ color: aiOpsColor }}>{aiOpsUsed} / {aiOpsLimit}</span>
                            </div>
                            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                              <div className="h-2 rounded-full transition-all" style={{ width: `${aiOpsPct}%`, background: aiOpsColor }} />
                            </div>
                            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                              <span>{Math.max(0, aiOpsLimit - aiOpsUsed)} disponibles</span>
                              <span>Renueva el {resetDate}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Comprar: minutos + tareas en una sola tarjeta ── */}
                  {(() => {
                    const warnPct  = Math.max(minutesPct, aiOpsPct);
                    const bgStyle  = warnPct >= 70 ? 'rgba(108,59,255,0.03)' : 'var(--c-surface)';
                    const bdrStyle = warnPct >= 90 ? '1px solid rgba(239,68,68,0.35)' : warnPct >= 70 ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border-2)';
                    return (
                      <div id="comprar" className="rounded-xl p-5" style={{ background: bgStyle, border: bdrStyle, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                        <h2 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Comprar saldo</h2>
                        {warnPct >= 70 && (
                          <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: warnPct >= 90 ? '#ef4444' : '#f59e0b' }}>
                            <AlertTriangle size={11} />
                            {warnPct >= 90 ? 'Saldo bajo — recarga pronto' : 'Tu saldo está bajando'}
                          </p>
                        )}
                        <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Se suman al instante. No afectan tu plan mensual.</p>
                        {annualContractInfo ? (
                          <div className="flex flex-col gap-5">
                            <AnnualContractCallout action="comprar_minutos"  folio={annualContractInfo.folio} endDate={annualContractInfo.endDate} isExpired={annualContractInfo.isExpired} />
                            <div style={{ borderTop: '1px solid var(--c-border)' }} />
                            <AnnualContractCallout action="comprar_tareas"   folio={annualContractInfo.folio} endDate={annualContractInfo.endDate} isExpired={annualContractInfo.isExpired} />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-5">
                            {minutesIncluded > 0 && (
                              <div>
                                {aiOpsLimit > 0 && <p className="text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: 'var(--c-text-3)' }}>Minutos</p>}
                                <BuyMinutesSection token={token} />
                              </div>
                            )}
                            {minutesIncluded > 0 && aiOpsLimit > 0 && (
                              <div style={{ borderTop: '1px solid var(--c-border)' }} />
                            )}
                            {aiOpsLimit > 0 && (
                              <div>
                                {minutesIncluded > 0 && <p className="text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: 'var(--c-text-3)' }}>Tareas</p>}
                                <BuyOpsSection token={token} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div id="recarga" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <h3 className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Recarga automática</h3>
                    <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Activa para recargar automáticamente cuando el saldo baje de un umbral.</p>
                    <AutoRefillSection token={token} />
                  </div>
                </div>

                {/* ── Col 2: Consumo promedio + Historial de minutos ── */}
                <div className="flex flex-col gap-5" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                  {(allCalls.length > 0 || (aiOpsLimit > 0 && aiOpsUsed > 0)) && (
                    <div id="consumo-promedio" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Consumo promedio</h2>
                      <div className={allCalls.length > 0 && aiOpsLimit > 0 && aiOpsUsed > 0 ? 'grid grid-cols-2 gap-4' : ''}>
                        {allCalls.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {aiOpsLimit > 0 && <p className="text-[10px] font-semibold tracking-wide uppercase mb-1" style={{ color: 'var(--c-text-3)' }}>Minutos</p>}
                            <StatBox label="Por día"    value={`${avgMinPerDay} min`} />
                            <StatBox label="Por semana" value={`${avgMinPerWeek} min`} />
                            <StatBox label="Por mes"    value={`${avgMinPerMonth} min`} highlight={avgMinPerMonth > minutesIncluded * 0.9} />
                          </div>
                        )}
                        {aiOpsLimit > 0 && aiOpsUsed > 0 && (
                          <div className="flex flex-col gap-2">
                            {allCalls.length > 0 && <p className="text-[10px] font-semibold tracking-wide uppercase mb-1" style={{ color: 'var(--c-text-3)' }}>Tareas</p>}
                            <StatBox label="Por día"    value={`${avgOpsPerDay}`} />
                            <StatBox label="Por semana" value={`${avgOpsPerWeek}`} />
                            <StatBox label="Por mes"    value={`${avgOpsPerMonth}`} highlight={avgOpsPerMonth > aiOpsLimit * 0.9} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div id="historial" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Historial de minutos</h2>
                    <div className="relative">
                      <div className="overflow-y-auto" style={{ maxHeight: '420px', paddingRight: 12 }}>
                        <MinutesLedgerSection agentId={agent.id} minutesIncluded={minutesIncluded} minutesUsed={minutesUsed} callerNames={callerNames} />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                        style={{ background: 'linear-gradient(to bottom, transparent, var(--c-surface))' }} />
                    </div>
                  </div>
                </div>

                {/* ── Col 3: Serial ── */}
                <div className="flex flex-col gap-5" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                  {accountSerial && (
                    <AccountSerialBadge serial={accountSerial} variant="card" />
                  )}
                </div>

              </div>
            </div>
          )}
        </div>

            <PortalFooter token={token} />
          </div> // /main content column
  );

  // ── V2 body: design-system shell (outer containers only; inner logic untouched) ──
  const pageBodyV2 = (
    <div className="flex-1 min-w-0 flex flex-col">

      {/* Tab nav — mobile only (unchanged from V1) */}
      <div className="md:hidden" style={{ background: 'var(--c-modal)', borderBottom: '1px solid var(--c-border)', position: 'sticky', top: 53, zIndex: 9 }}>
        <div className="px-4 sm:px-6">
          <PortalTabNav token={token} currentTab={tab} tabs={TABS} />
        </div>
      </div>

      {/* Alerts (unchanged from V1) */}
      {(!agent.active || minutesPct > 80) && (
        <div className="px-4 sm:px-6 pt-4 flex flex-col gap-2 max-w-4xl w-full mx-auto md:mx-0">
          {billingPaused && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={15} color="#f87171" className="flex-shrink-0" />
              <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                Tu empleado está pausado por falta de pago. Actualiza tu método de pago o contacta a Centinelia.
              </p>
            </div>
          )}
          {clientPaused && !billingPaused && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle size={15} color="#fbbf24" className="flex-shrink-0" />
              <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                Tu empleado está pausado voluntariamente. Puedes reanudarlo cuando quieras desde la pestaña Resumen.
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

      {/* ── Tab content ── */}
      <div className={`flex-1 w-full md:mx-0 ${tab === 'negocio' ? '' : tab === 'inicio' || tab === 'cuenta' ? 'max-w-6xl' : 'max-w-4xl'}`} style={{ position: 'relative', zIndex: 1 }}>

        {/* ── INICIO (V2 with design system shells) ───────────────── */}
        {tab === 'inicio' && (
          <PageContainer>
            <div className="flex flex-col gap-5">

              {/* Greeting banner — status-aware, keep as-is (styled alert) */}
              <div className="rounded-xl px-5 py-4"
                style={{ background: officeOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${officeOk ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: officeOk ? '#22c55e' : '#ef4444', boxShadow: officeOk ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }} />
                  <p className="text-sm" style={{ color: 'var(--c-text)' }}>
                    <span className="font-semibold">{greeting}, {agent.business_name}.</span>{' '}
                    <span style={{ color: 'var(--c-text-2)' }}>
                      {officeOk ? 'Tu oficina está activa y atendiendo.' : 'Tu oficina está pausada en este momento.'}
                    </span>
                  </p>
                </div>
              </div>

              {isFirstTime && (
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(108,59,255,0.06)',
                    border:     '1px solid rgba(108,59,255,0.15)',
                    minHeight:  96,
                  }}
                >
                  <div style={{ position: 'absolute', bottom: 0, left: 16, width: 160, height: 112, pointerEvents: 'none' }}>
                    <Image src="/meerkats-team.png" alt="" fill sizes="160px"
                      style={{ objectFit: 'contain', objectPosition: 'bottom left' }} />
                  </div>
                  <div style={{ paddingLeft: 196, paddingRight: 20, minHeight: 96, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#6C3BFF' }}>Tu equipo está listo</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
                      En cuanto llegue la primera llamada, los registros aparecerán aquí automáticamente.
                    </p>
                  </div>
                </div>
              )}

              {/* Contract gate notice */}
              {!agent.contract_accepted_at && (
                <a href={`/portal/${token}/configurar#contrato`}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 no-underline transition-opacity hover:opacity-90"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <p className="flex-1 text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
                    Tienes un contrato de servicios pendiente de firma.
                  </p>
                  <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#f59e0b' }}>Firmar ahora</span>
                  <ChevronRight size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                </a>
              )}

              {/* Reauth alerts — mobile strip */}
              {reauthAlerts.length > 0 && (
                <div className="flex flex-col gap-2 lg:hidden">
                  {reauthAlerts.map(alert => (
                    <Link key={alert.provider}
                      href={`/portal/${token}/oficina/integraciones`}
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

                  {/* KPI section */}
                  <PageSection
                    heading={
                      <SectionHeader
                        eyebrow="HOY"
                        title="Resumen de actividad"
                        as="h2"
                      />
                    }
                  >
                    <GridStretch cols={{ base: 2, md: 4 }} gap={3}>
                      <KpiCard icon={<PhoneCall size={16} color="#6C3BFF" />}    value={String(calls.length)}   label="Conversaciones"   sub={`prom. ${avgDuration} min`}                                                                                   valueColor="#6C3BFF"  accentColor="#6C3BFF"  />
                      <KpiCard icon={<CheckCircle size={16} color="#22c55e" />}  value={String(resolvedCount)}  label="Sin intervención" sub={calls.length > 0 ? `${autonomousRate}% del total` : undefined}                                                valueColor="#22c55e"  accentColor="#22c55e"  />
                      {showLeads   && leads.length  > 0 && <KpiCard icon={<Users size={16} color="#22c55e" />}         value={String(leads.length)}  label="Leads"    sub={calls.length > 0 ? `${Math.round((leads.length / calls.length) * 100)}% conv.` : undefined} valueColor="#22c55e"  accentColor="#22c55e"  />}
                      {showOrders  && orders.length > 0 && <KpiCard icon={<ShoppingBag size={16} color="#f59e0b" />}   value={String(orders.length)} label="Pedidos"  sub={pendingOrders > 0 ? `${pendingOrders} pendientes` : undefined}                      valueColor="#f59e0b"  accentColor="#f59e0b"  />}
                      {showAppts   && appts.length  > 0 && <KpiCard icon={<CalendarDays size={16} color="#3b82f6" />}  value={String(appts.length)}  label="Citas"    sub={confirmedAppts > 0 ? `${confirmedAppts} confirmadas` : undefined}                   valueColor="#3b82f6"  accentColor="#3b82f6"  />}
                      {showOutbound && outboundCallCount > 0 && <KpiCard icon={<PhoneOutgoing size={16} color="#a855f7" />} value={String(outboundCallCount)} label="Salientes"                                                                                 valueColor="#a855f7"  accentColor="#a855f7"  />}
                      {showOps && <KpiCard icon={<Zap size={16} color="#06b6d4" />} value={String(aiOpsUsed)} label="Tareas" sub={`de ${aiOpsLimit} disponibles`} valueColor="#06b6d4" accentColor="#06b6d4" />}
                    </GridStretch>

                    {/* Autonomous resolution rate */}
                    {calls.length > 0 && (
                      <p className="text-sm -mt-1" style={{ color: 'var(--c-text-2)' }}>
                        Tu oficina resolvió el{' '}
                        <span className="font-semibold" style={{ color: '#22c55e' }}>{autonomousRate}%</span>
                        {' '}de las solicitudes sin intervención humana.
                      </p>
                    )}
                  </PageSection>

                  {/* Brief del día — solo cuando hay Nox activo en el equipo */}
                  {hasNox && <BriefDelDiaCard />}

                  {/* Tu equipo hoy */}
                  {teamToday.length > 0 && (
                    <PageSection heading={<SectionHeader eyebrow="EQUIPO" title="Tu equipo hoy" as="h2" />}>
                      <Card id="equipo-hoy" padding="md">
                        <div className="flex flex-col">
                          {teamToday.map((m, idx) => (
                            <div key={m.token}
                              className="flex items-center gap-3 py-2.5"
                              style={{ borderBottom: idx < teamToday.length - 1 ? '1px solid var(--c-divider)' : 'none' }}>
                              <div className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: m.active ? '#22c55e' : '#9ca3af', boxShadow: m.active ? '0 0 5px #22c55e' : 'none' }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{m.name}</p>
                                {m.role && <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{m.role}</p>}
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 text-xs" style={{ color: 'var(--c-text-3)' }}>
                                {m.calls > 0 && (
                                  <span className="flex items-center gap-1">
                                    <PhoneCall size={11} style={{ color: '#6C3BFF' }} /> {m.calls}
                                  </span>
                                )}
                                {m.ops > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Zap size={11} style={{ color: '#06b6d4' }} /> {m.ops}
                                  </span>
                                )}
                              </div>
                              <Link href={`/portal/${m.token}/configurar`}
                                className="text-xs transition-opacity hover:opacity-70 flex-shrink-0"
                                style={{ color: '#9B6DFF' }}>
                                Ver →
                              </Link>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </PageSection>
                  )}

                  {/* Insights de la semana */}
                  <InsightsSection token={token} />

                  {/* Actividad reciente */}
                  <PageSection heading={<SectionHeader eyebrow="FEED" title="Actividad reciente" as="h2" />}>
                    <Card id="actividad" padding="md">
                      {resumenFeed.length === 0 ? (
                        <div className="flex flex-col items-center py-8 gap-0">
                          <div className="relative" style={{ width: 96, height: 132 }}>
                            <Image src="/agent-f2.png" alt="" fill sizes="96px"
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
                    </Card>
                  </PageSection>

                  {/* Actividad horaria */}
                  {calls.length > 0 && (
                    <PageSection heading={<SectionHeader eyebrow="ANÁLISIS" title="Actividad de tu oficina" as="h2" />}>
                      <Card id="horas-pico" padding="md">
                        <PeakHoursChart hourCounts={hourCounts} />
                      </Card>
                    </PageSection>
                  )}

                  {/* Reporte mensual — mobile only */}
                  <div className="lg:hidden">
                    <PageSection heading={<SectionHeader eyebrow="REPORTE" title="Reporte mensual" as="h2" />}>
                      <Card padding="md">
                        <div className="flex items-center gap-1.5 mb-4">
                          <InfoTooltip text="Descarga el resumen del mes con llamadas, resultados, minutos y horas pico." />
                        </div>
                        <MonthReportPicker token={token} />
                      </Card>
                    </PageSection>
                  </div>

                  {/* Contexto de empleados — mobile */}
                  <div className="lg:hidden">
                    <PageSection heading={<SectionHeader eyebrow="CONTEXTO" title="Contexto de empleados" as="h2" />}>
                      <Card padding="md">
                        <div className="flex items-center gap-1.5 mb-4">
                          <InfoTooltip text="Cuánto contexto tiene cada empleado cargado en su memoria." />
                        </div>
                        {agentContextCards.some(a => a.tokens > 0) ? (
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
                                      {a.tokens >= 1000 ? `${(a.tokens / 1000).toFixed(1)}k` : a.tokens} mem
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-center gap-2 py-2">
                            <p className="text-xs" style={{ color: 'var(--c-text-3)', lineHeight: 1.6 }}>
                              Tu empleado aún no tiene instrucciones ni manual configurados. Agrégalos para que aprenda tu organización.
                            </p>
                            <Link href={`/portal/${token}/empleados`}
                              className="text-xs font-semibold transition-opacity hover:opacity-70 mt-1"
                              style={{ color: '#9B6DFF' }}>
                              Configurar en Empleados →
                            </Link>
                          </div>
                        )}
                      </Card>
                    </PageSection>
                  </div>

                </div>{/* end main column */}

                {/* ── Right column (desktop only) ── */}
                <div className="hidden lg:flex flex-col gap-4">

                  {showOutbound && (
                    <PageSection heading={<SectionHeader eyebrow="SALIENTES" title="Salientes" as="h2" right={<Link href={`/portal/${token}/llamadas/salientes`} className="text-xs transition-opacity hover:opacity-70" style={{ color: '#9B6DFF' }}>Ver →</Link>} />}>
                      <Card padding="md">
                        <div className="flex flex-col gap-3">
                          <StatBox label="Campañas activas"     value={String(activeOutboundCampaigns)} />
                          <StatBox label="Contactos pendientes" value={String(pendingOutboundCount)}    />
                          <StatBox label="Última ejecución"     value={lastCampaignRunAt ? fmtRelative(lastCampaignRunAt) : 'Nunca'} />
                        </div>
                      </Card>
                    </PageSection>
                  )}

                  {/* Reporte mensual — desktop sidebar */}
                  <PageSection heading={<SectionHeader eyebrow="REPORTE" title="Reporte mensual" as="h2" />}>
                    <Card id="reporte-mensual" padding="md">
                      <div className="flex items-center gap-1.5 mb-4">
                        <InfoTooltip text="Descarga el resumen del mes con llamadas, resultados, minutos y horas pico." />
                      </div>
                      <MonthReportPicker token={token} />
                    </Card>
                  </PageSection>

                  {/* Contexto de empleados — desktop */}
                  <PageSection heading={<SectionHeader eyebrow="CONTEXTO" title="Contexto de empleados" as="h2" />}>
                    <Card id="contexto" padding="md">
                      <div className="flex items-center gap-1.5 mb-4">
                        <InfoTooltip text="Cuánto contexto tiene cada empleado cargado en su memoria (manual de la organización + instrucciones del puesto + aprendizajes). A más memoria, más informado está el empleado." />
                      </div>
                      {agentContextCards.some(a => a.tokens > 0) ? (
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
                                    {a.tokens >= 1000 ? `${(a.tokens / 1000).toFixed(1)}k` : a.tokens} mem
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center gap-2 py-1">
                          <p className="text-xs" style={{ color: 'var(--c-text-3)', lineHeight: 1.6 }}>
                            Tu empleado aún no tiene instrucciones ni manual configurados. Agrégalos para que aprenda tu organización.
                          </p>
                          <Link href={`/portal/${token}/empleados`}
                            className="text-xs font-semibold transition-opacity hover:opacity-70 mt-1"
                            style={{ color: '#9B6DFF' }}>
                            Configurar en Empleados →
                          </Link>
                        </div>
                      )}
                    </Card>
                  </PageSection>

                </div>{/* end right column */}

              </div>{/* end two-column grid */}
            </div>
          </PageContainer>
        )}

        {/* ── NEGOCIO (V2 design system shells) ───────────────────── */}
        {tab === 'negocio' && (
          <PageContainer>
            <div className="flex flex-col lg:flex-row gap-5 items-start">

              {/* Main column */}
              <div className="flex-1 min-w-0 flex flex-col gap-5">
                <div id="organizacion">
                  {agent.portal_email && (
                    <OrgCard token={token} portalEmail={agent.portal_email} logoUrl={(agent as any).logo_url ?? null} initialDescription={orgSettings?.business_description ?? (agent as any).business_description ?? ''} />
                  )}
                </div>

                <PageSection heading={<SectionHeader eyebrow="IDENTIDAD" title="Branding de documentos y correos" as="h2" right={<InfoTooltip text="Define los colores, datos de contacto y pie de página que aparecen en todos los correos y documentos que genera tu empleado." />} />}>
                  <Card id="branding" padding="md">
                    <BrandKitEditor
                      token={token}
                      logoUrl={(agent as any).logo_url ?? null}
                      businessName={agent.business_name}
                      agentName={agent.agent_name ?? agent.business_name}
                      initialColor={orgSettings?.email_brand_color ?? (agent as any).email_brand_color ?? '#6C3BFF'}
                      initialColorSecondary={orgSettings?.brand_color_secondary ?? (agent as any).brand_color_secondary ?? ''}
                      initialWebsite={orgSettings?.brand_website ?? (agent as any).brand_website ?? ''}
                      initialAddress={orgSettings?.brand_address ?? (agent as any).brand_address ?? ''}
                      initialFooter={orgSettings?.email_footer_text ?? (agent as any).email_footer_text ?? ''}
                    />
                  </Card>
                </PageSection>

                <PageSection heading={<SectionHeader eyebrow="CONOCIMIENTO" title="Manual de la organización" as="h2" right={<InfoTooltip text="Tus empleados consultan esta información en todas sus interacciones: llamadas, correos y mensajes. Incluye servicios, precios, FAQs y cualquier detalle que deban conocer." />} />}>
                  <Card id="conocimiento" padding="md">
                    <KnowledgeBaseEditor
                      token={token}
                      initialValue={orgSettings?.knowledge_base ?? (agent as any).knowledge_base ?? ''}
                      websiteSynced={!!(orgSettings?.website_knowledge ?? (agent as any).website_knowledge)}
                      hasDescription={!!((orgSettings?.business_description ?? (agent as any).business_description)?.trim())}
                    />
                  </Card>
                </PageSection>

                <PageSection heading={<SectionHeader eyebrow="PERFIL" title="Perfil del responsable" as="h2" right={<InfoTooltip text="Cuéntale a tus empleados quién eres, cuáles son tus prioridades y cómo te gusta que se hagan las cosas. Cuanto más sepan de ti, mejor se adaptarán a tu estilo." />} />}>
                  <Card id="perfil-dueno" padding="md">
                    <OwnerProfileEditor
                      token={token}
                      initialValue={orgSettings?.owner_profile ?? (agent as any).owner_profile ?? ''}
                    />
                  </Card>
                </PageSection>

                <PageSection heading={<SectionHeader eyebrow="CONTRATOS" title="Contratos internos" as="h2" />}>
                  <Card id="contratos-internos" padding="md">
                    <ContractTrackerSection token={token} />
                  </Card>
                </PageSection>

              </div>

              {/* Col 2 — Sitio web, Reseñas, Notificaciones */}
              <div className="flex flex-col gap-5 w-full" style={{ flexBasis: 420, flexShrink: 0 }}>
                <PageSection heading={<SectionHeader eyebrow="PRESENCIA" title="Sitio web y reseñas" as="h2" />}>
                  <Card id="sitio" padding="md">
                    <div className="flex items-center gap-1.5 mb-4">
                      <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Sitio web</h2>
                      <InfoTooltip text="Sincroniza tu sitio para que tu empleado tenga siempre la información actualizada de tu organización." />
                    </div>
                    <WebsiteSyncButton token={token} currentUrl={orgSettings?.business_website ?? (agent as any).business_website ?? null} />
                    <div style={{ borderTop: '1px solid var(--c-border)', margin: '20px -20px 16px' }} />
                    <div className="flex items-center gap-1.5 mb-3">
                      <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Reseñas</h2>
                      <InfoTooltip text="Tu empleado comparte este link con tus clientes al finalizar llamadas exitosas para que dejen una reseña." />
                    </div>
                    <ReviewLinkEditor token={token} initialValue={orgSettings?.google_review_url ?? (agent as any).google_review_url ?? ''} />
                  </Card>
                </PageSection>

                <PageSection heading={<SectionHeader eyebrow="NOTIFICACIONES" title="Notificaciones automáticas al cliente" as="h2" right={<InfoTooltip text="Cuando tu empleado atiende una llamada, Centinelia envía correos automáticos al cliente (confirmación de cita, acuse de lead, etc.). Por defecto salen desde centinelia.mx. Registra tu dominio para que lleguen desde tuempresa.com." />} />}>
                  <Card id="dominio-correo" padding="md">
                    <EmailSettings token={token} />
                  </Card>
                </PageSection>
              </div>

              {/* Col 3 — Horario de atención */}
              <div className="flex flex-col gap-5 w-full" style={{ flexBasis: 280, flexShrink: 0 }}>
                <PageSection heading={<SectionHeader eyebrow="DISPONIBILIDAD" title="Horario de atención" as="h2" right={<InfoTooltip text="Define los días y horarios en que tu empleado está disponible para atender llamadas." />} />}>
                  <Card id="horarios" padding="md">
                    <BusinessHoursEditor token={token} initialHours={((orgSettings?.business_hours ?? agent.business_hours) ?? null) as BusinessHours | null} />
                  </Card>
                </PageSection>
              </div>

            </div>
          </PageContainer>
        )}

        {/* ── CUENTA (V2 design system shells) ────────────────────── */}
        {tab === 'cuenta' && (
          <PageContainer>
            <div className="flex flex-col gap-5">

              {/* Contract gate banner */}
              {!agent.contract_accepted_at && (
                <a href={`/portal/${token}/configurar#contrato`} className="flex items-start gap-3 rounded-xl px-4 py-3.5 no-underline transition-opacity hover:opacity-90"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)' }}>
                  <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#92400e' }}>Contrato pendiente de firma</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                      Revisa y firma el contrato de servicios para formalizar el uso de tu empleado digital. Ve a Configurar tu empleado para firmarlo.
                    </p>
                  </div>
                  <ChevronRight size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
                </a>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px_300px] gap-5 items-start">

                {/* ── Col 1: Uso + Compras + Recarga ── */}
                <div className="flex flex-col gap-5" id="minutos" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>

                  {/* Uso del mes */}
                  {(minutesIncluded > 0 || aiOpsLimit > 0) && (
                    <PageSection heading={<SectionHeader eyebrow="SALDO" title="Uso del mes" as="h2" />}>
                      <Card id="uso-del-mes" padding="md">
                        <div className="flex flex-col gap-4">
                          {minutesIncluded > 0 && (
                            <div>
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>Minutos</span>
                                <span style={{ color: minutesColor }}>{minutesUsed} / {minutesIncluded} min</span>
                              </div>
                              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                                <div className="h-2 rounded-full transition-all" style={{ width: `${minutesPct}%`, background: minutesColor }} />
                              </div>
                              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                                <span>{minutesRemain} disponibles</span>
                                <span>Renueva el {resetDate}</span>
                              </div>
                              {rolloverMinutes > 0 && (
                                <p className="text-xs mt-1" style={{ color: '#6C3BFF' }}>{planBaseMinutes} base + {rolloverMinutes} del mes anterior</p>
                              )}
                            </div>
                          )}
                          {aiOpsLimit > 0 && (
                            <div>
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="font-medium" style={{ color: 'var(--c-text-2)' }}>Tareas</span>
                                <span style={{ color: aiOpsColor }}>{aiOpsUsed} / {aiOpsLimit}</span>
                              </div>
                              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                                <div className="h-2 rounded-full transition-all" style={{ width: `${aiOpsPct}%`, background: aiOpsColor }} />
                              </div>
                              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                                <span>{Math.max(0, aiOpsLimit - aiOpsUsed)} disponibles</span>
                                <span>Renueva el {resetDate}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    </PageSection>
                  )}

                  {/* Comprar saldo — dynamic border/bg preserved via style prop */}
                  {(() => {
                    const warnPct  = Math.max(minutesPct, aiOpsPct);
                    const bgStyle  = warnPct >= 70 ? 'rgba(108,59,255,0.03)' : 'var(--c-surface)';
                    const bdrStyle = warnPct >= 90 ? '1px solid rgba(239,68,68,0.35)' : warnPct >= 70 ? '1px solid rgba(108,59,255,0.35)' : '1px solid var(--c-border-2)';
                    return (
                      <PageSection heading={<SectionHeader eyebrow="COMPRAS" title="Comprar saldo" as="h2" />}>
                        <Card id="comprar" padding="md" style={{ background: bgStyle, border: bdrStyle }}>
                          {warnPct >= 70 && (
                            <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: warnPct >= 90 ? '#ef4444' : '#f59e0b' }}>
                              <AlertTriangle size={11} />
                              {warnPct >= 90 ? 'Saldo bajo — recarga pronto' : 'Tu saldo está bajando'}
                            </p>
                          )}
                          <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Se suman al instante. No afectan tu plan mensual.</p>
                          {annualContractInfo ? (
                            <div className="flex flex-col gap-5">
                              <AnnualContractCallout action="comprar_minutos"  folio={annualContractInfo.folio} endDate={annualContractInfo.endDate} isExpired={annualContractInfo.isExpired} />
                              <div style={{ borderTop: '1px solid var(--c-border)' }} />
                              <AnnualContractCallout action="comprar_tareas"   folio={annualContractInfo.folio} endDate={annualContractInfo.endDate} isExpired={annualContractInfo.isExpired} />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-5">
                              {minutesIncluded > 0 && (
                                <div>
                                  {aiOpsLimit > 0 && <p className="text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: 'var(--c-text-3)' }}>Minutos</p>}
                                  <BuyMinutesSection token={token} />
                                </div>
                              )}
                              {minutesIncluded > 0 && aiOpsLimit > 0 && (
                                <div style={{ borderTop: '1px solid var(--c-border)' }} />
                              )}
                              {aiOpsLimit > 0 && (
                                <div>
                                  {minutesIncluded > 0 && <p className="text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: 'var(--c-text-3)' }}>Tareas</p>}
                                  <BuyOpsSection token={token} />
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      </PageSection>
                    );
                  })()}

                  <PageSection heading={<SectionHeader eyebrow="AUTOMATIZACIÓN" title="Recarga automática" as="h2" />}>
                    <Card id="recarga" padding="md">
                      <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>Activa para recargar automáticamente cuando el saldo baje de un umbral.</p>
                      <AutoRefillSection token={token} />
                    </Card>
                  </PageSection>
                </div>

                {/* ── Col 2: Consumo promedio + Historial de minutos ── */}
                <div className="flex flex-col gap-5" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                  {(allCalls.length > 0 || (aiOpsLimit > 0 && aiOpsUsed > 0)) && (
                    <PageSection heading={<SectionHeader eyebrow="ANÁLISIS" title="Consumo promedio" as="h2" />}>
                      <Card id="consumo-promedio" padding="md">
                        <div className={allCalls.length > 0 && aiOpsLimit > 0 && aiOpsUsed > 0 ? 'grid grid-cols-2 gap-4' : ''}>
                          {allCalls.length > 0 && (
                            <div className="flex flex-col gap-2">
                              {aiOpsLimit > 0 && <p className="text-[10px] font-semibold tracking-wide uppercase mb-1" style={{ color: 'var(--c-text-3)' }}>Minutos</p>}
                              <StatBox label="Por día"    value={`${avgMinPerDay} min`} />
                              <StatBox label="Por semana" value={`${avgMinPerWeek} min`} />
                              <StatBox label="Por mes"    value={`${avgMinPerMonth} min`} highlight={avgMinPerMonth > minutesIncluded * 0.9} />
                            </div>
                          )}
                          {aiOpsLimit > 0 && aiOpsUsed > 0 && (
                            <div className="flex flex-col gap-2">
                              {allCalls.length > 0 && <p className="text-[10px] font-semibold tracking-wide uppercase mb-1" style={{ color: 'var(--c-text-3)' }}>Tareas</p>}
                              <StatBox label="Por día"    value={`${avgOpsPerDay}`} />
                              <StatBox label="Por semana" value={`${avgOpsPerWeek}`} />
                              <StatBox label="Por mes"    value={`${avgOpsPerMonth}`} highlight={avgOpsPerMonth > aiOpsLimit * 0.9} />
                            </div>
                          )}
                        </div>
                      </Card>
                    </PageSection>
                  )}
                  <PageSection heading={<SectionHeader eyebrow="HISTORIAL" title="Historial de minutos" as="h2" />}>
                    <Card id="historial" padding="md">
                      <div className="relative">
                        <div className="overflow-y-auto" style={{ maxHeight: '420px', paddingRight: 12 }}>
                          <MinutesLedgerSection agentId={agent.id} minutesIncluded={minutesIncluded} minutesUsed={minutesUsed} callerNames={callerNames} />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                          style={{ background: 'linear-gradient(to bottom, transparent, var(--c-surface))' }} />
                      </div>
                    </Card>
                  </PageSection>
                </div>

                {/* ── Col 3: Serial ── */}
                <div className="flex flex-col gap-5" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
                  {accountSerial && (
                    <AccountSerialBadge serial={accountSerial} variant="card" />
                  )}
                </div>

              </div>
            </div>
          </PageContainer>
        )}

      </div>

      <PortalFooter token={token} />
    </div>
  );

  // V2 layout: PortalShell renders header + V2 sidebar, main column is passed as prop
  if (v2Enabled) {
    return (
      <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
        <div className="min-h-screen relative flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)', overflowX: 'clip' }}>
          <div style={{ position: 'absolute', width: 900, height: 500, top: -320, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse, rgba(108,59,255,0.13) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
          <PortalShell
            orgId={agent.portal_email ?? ''}
            token={token}
            businessName={agent.business_name}
            logoUrl={(agent as any).logo_url ?? null}
            hasOpsAgent={hasOpsAgent}
            showOutbound={showOutbound || agent.plan === 'pro'}
            isOwner={isOwner}
            modules={modules}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            hasStripe={hasStripe}
            headerActions={
              <>
                {accountSerial && <AccountSerialBadge serial={accountSerial} variant="header" />}
                <NotificationBell token={token} />
                <PortalLogout />
              </>
            }
            main={pageBodyV2}
          />
        </div>
      </ThemeProvider>
    );
  }

  // V1 layout: BusinessSwitcher header + PortalSidebar
  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen relative flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)', overflowX: 'clip' }}>
        <div style={{ position: 'absolute', width: 900, height: 500, top: -320, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse, rgba(108,59,255,0.13) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* V1 header */}
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
              {accountSerial && <AccountSerialBadge serial={accountSerial} variant="header" />}
              <NotificationBell token={token} />
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* V1 body: sidebar + main */}
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
            jornadaType={(agent as any).jornada_type ?? 'combinada'}
          />
          {pageBodyV1}
        </div>

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

function callOutcomeDesc(outcome: string): string {
  switch (outcome) {
    case 'lead_created':        return 'Preguntó y dejó sus datos de contacto.';
    case 'appointment_booked':  return 'Agendó una cita con el equipo.';
    case 'order_taken':         return 'Realizó un pedido.';
    case 'transferred':         return 'Fue transferido al equipo.';
    case 'info_provided':       return 'Recibió información y fue atendido.';
    case 'escalated_whatsapp':  return 'Llamada escalada para seguimiento.';
    case 'missed':              return 'Llamada perdida.';
    case 'unanswered':          return 'No fue atendido.';
    default:                    return 'Llamada completada.';
  }
}
