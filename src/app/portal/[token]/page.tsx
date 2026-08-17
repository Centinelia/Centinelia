export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Phone, CheckCircle, PhoneCall, PhoneOutgoing, Users, ShoppingBag, CalendarDays, AlertTriangle, ChevronRight, Zap, Inbox, Lightbulb, Clock, FileText } from 'lucide-react';
import { MonthReportPicker } from './MonthReportPicker';
import ConsumoPromedioCard from './ConsumoPromedioCard';
import type { BusinessHours, Plan } from '@/types/agent';
import type { VoiceCall } from '@/types/agent';
import { MINUTES_TIER_CONFIG } from '@/lib/billing/plans';
import type { MinutesTier } from '@/lib/billing/plans';
import { ThemeProvider } from '@/components/ThemeProvider';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { redirect } from 'next/navigation';

import PortalLogout            from './PortalLogout';
import HashScrollHighlight     from './HashScrollHighlight';
import BrandKitEditor          from './BrandKitEditor';
import SheetsMappingsSection    from './configurar/SheetsMappingsSection';
import PortalLeadsSection      from './PortalLeadsSection';
import PortalOrdersSection     from './PortalOrdersSection';
import PortalAppointmentsSection from './PortalAppointmentsSection';
import BuyMinutesSection       from './BuyMinutesSection';
import FallbackBanner          from './FallbackBanner';
import { isValidE164, maskPhoneNumber } from '@/lib/billing/fallback-validate';
import BuyOpsSection           from './BuyOpsSection';
import AnnualContractCallout   from './AnnualContractCallout';
import MinutesLedgerSection    from './MinutesLedgerSection';
import HistorialConsumoSection from './HistorialConsumoSection';
import CallCard                from './CallCard';
import DownloadCallsCSV        from './DownloadCallsCSV';
import PeakHoursChart          from './PeakHoursChart';
import NotificationBell        from './NotificationBell';
import PortalFooter            from './PortalFooter';

import ActivityTabsCard        from './ActivityTabsCard';
import CallsSearch             from './CallsSearch';
import PortalTabNav           from './PortalTabNav';
import PortalShell            from './PortalShell';
import { PageContainer, PageSection, GridStretch, SectionHeader, Card, StatChip } from '@/components/portal-ui';
import KnowledgeBaseEditor    from './KnowledgeBaseEditor';
import OwnerProfileEditor     from './OwnerProfileEditor';
import WebsiteSyncButton      from './WebsiteSyncButton';
import ReviewLinkEditor       from './ReviewLinkEditor';
import BusinessHoursEditor    from './BusinessHoursEditor';
import BrandVoiceEditor       from './BrandVoiceEditor';
import OutboundSection           from './OutboundSection';
import AutoRefillSection         from './AutoRefillSection';
import IntegrationsHub           from './IntegrationsHub';
import PoliciesSection          from './PoliciesSection';
import OrgCard                  from './OrgCard';
import DailyAvailabilityCard    from './DailyAvailabilityCard';
import NegocioTabs              from './NegocioTabs';
import DirectorioEditor         from './DirectorioEditor';
import type { DirectoryPerson } from '@/lib/helpdesk/folio';
import ContractTrackerSection   from './ContractTrackerSection';
import ContractSection          from './ContractSection';
import InfoTooltip              from '@/components/InfoTooltip';
import AccountSerialBadge       from './AccountSerialBadge';
import CuentaUsageTabsCard      from './CuentaUsageTabsCard';
import { BriefDelDiaCard }      from './BriefDelDiaCard';
import { getOrCreateSerial }    from '@/lib/portal/serial';
import { computePoolStatus }    from '@/lib/portal/pool-status';
import type { OutboundCall }     from './PortalOutboundSection';
import type { ContactOutbound } from './PortalContactsSection';

type Tab = 'inicio' | 'llamadas' | 'salientes' | 'oficina' | 'empleados' | 'agentes' | 'organizacion' | 'negocio' | 'integraciones' | 'cuenta' | 'equipo';

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

  if (tab === 'oficina')                            redirect(`/portal/${token}/oficina`);
  if (tab === 'empleados' || tab === 'agentes')     redirect(`/portal/${token}/empleados`);
  if (tab === 'llamadas' || tab === 'salientes')    redirect(`/portal/${token}/llamadas`);
  if (tab === 'integraciones')                      redirect(`/portal/${token}?tab=organizacion#integraciones`);
  if (tab === 'equipo')                             redirect(`/portal/${token}/equipo`);
  if (tab === 'negocio')                            redirect(`/portal/${token}?tab=organizacion`);

  // ── Auth: verify session owns this portal ─────────────────────────────────
  const cookieStore    = await cookies();
  const sessionCookie  = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session        = await verifySession(sessionCookie);

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  // "Primer agente activo del org" como display-agent, por retrocompat con el
  // resto de esta página (agent.id, agent.features, etc.). Sin concepto de primary.
  const { data: agent } = await supabase
    .from('voice_agents').select('*')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
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

  // All agents for this client (same portal_email).
  // || (no ??): en dev el verifySession puede devolver portalEmail: '' cuando
  // no hay DEV_PORTAL_EMAIL en .env.local. `??` no cae al fallback con ''
  // (no es nullish) → query filtra por email vacío → 0 rows. `||` sí cae
  // porque '' es falsy.
  const lookupEmail = session?.portalEmail || (agent as any).portal_email || null;

  // cycleStartIso: inicio del ciclo actual (primer día del mes de reset)
  // Se computa a partir de agent.minutes_reset_date para poder usarlo en el
  // Promise.all sin necesitar esperar acctMins (que viene del mismo batch).
  const cycleStartIso = (() => {
    const raw = (agent as any).minutes_reset_date as string | null | undefined;
    if (!raw) {
      // fallback: primer día del mes en curso
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }
    const resetNext = new Date(raw + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    while (resetNext < today) resetNext.setMonth(resetNext.getMonth() + 1);
    const cycleStart = new Date(resetNext);
    cycleStart.setMonth(cycleStart.getMonth() - 1);
    return cycleStart.toISOString();
  })();

  // ─── Batch 1: paralelizar TODAS las queries org-scoped que dependen de
  // portal_email pero son independientes entre sí. Antes eran 6 awaits en
  // serie (~180-600ms tigre en prod contra Supabase). Ahora un solo round-trip.
  // cycleStartIso declarado arriba a partir de agent.minutes_reset_date.

  const [
    clientAgentsRes,
    orgSettingsRes,
    acctMinsRes,
    opsAgentsRes,
    accountSerialRes,
    rolloverLostRes,
    opsLossRes,
    acctOpsRes,
    planCreditsThisCycleRes,
  ] = agent.portal_email
    ? await Promise.all([
        lookupEmail
          ? supabase
              .from('voice_agents')
              .select('id, business_name, agent_name, portal_token, active, client_paused, billing_status, plan, phone_number, logo_url, features, role, stripe_customer_id')
              .eq('portal_email', lookupEmail)
              .then(r => r.data)
          : Promise.resolve([] as any[]),
        supabase
          .from('organizations')
          .select('knowledge_base, owner_profile, business_description, business_email, business_hours, business_website, website_knowledge, google_review_url, email_brand_color, brand_color_secondary, brand_website, brand_address, brand_phone, email_footer_text, billing_model, contract_accepted_at, contract_ip, contract_signer_name, multilingual, brand_voice_guide, directory, monthly_ops_pool, monthly_ops_used, fallback_phone_number, ops_ledger_enabled')
          .eq('portal_email', agent.portal_email)
          .single()
          .then(r => r.data),
        supabase
          .from('account_minutes')
          .select('minutes_used, minutes_included, minutes_reset_date')
          .eq('portal_email', agent.portal_email)
          .single()
          .then(r => r.data),
        supabase
          .from('voice_agents')
          .select('id, ai_ops_used, ai_ops_limit, minutes_used, minutes_included, active')
          .eq('portal_email', agent.portal_email)
          .then(r => r.data),
        getOrCreateSerial(agent.portal_email).catch(() => null),
        supabase
          .from('minutes_ledger')
          .select('amount')
          .eq('portal_email', agent.portal_email)
          .eq('kind', 'rollover_cap')
          .gte('created_at', cycleStartIso)
          .then(r => r.data),
        supabase
          .from('ops_ledger')
          .select('amount, kind')
          .eq('portal_email', agent.portal_email)
          .in('kind', ['rollover_cap', 'unused_forfeited'])
          .gte('created_at', cycleStartIso)
          .then(r => r.data),
        supabase
          .from('account_ops')
          .select('ops_used, ops_balance, ops_included')
          .eq('portal_email', agent.portal_email)
          .maybeSingle()
          .then(r => r.data),
        // Plan base histórico del ciclo actual: suma de renewal + plan_upgrade
        // + plan_downgrade del ciclo. Antes se usaba MINUTES_TIER_CONFIG[current]
        // que refleja el plan post-upgrade, no el que estaba activo al inicio.
        // Cliente que hizo upgrade mid-cycle veía "500 base + 200 anterior"
        // cuando en realidad fue "300 del plan viejo + 200 anterior + 200 del
        // upgrade". Ver [[feedback-audit-read-path-fidelity]].
        supabase
          .from('minutes_ledger')
          .select('amount, kind')
          .eq('portal_email', agent.portal_email)
          .in('kind', ['renewal', 'renovacion', 'plan_upgrade', 'plan_downgrade'])
          .gte('created_at', cycleStartIso)
          .then(r => r.data),
      ])
    : [
        [] as any[],
        null,
        null,
        null as any,
        null,
        null,
        null,
        null,
        null,
      ];

  const clientAgents  = clientAgentsRes;
  const allClientAgents = clientAgents ?? [];
  const orgSettings   = orgSettingsRes as any;
  const acctMins      = acctMinsRes;
  const opsAgents     = opsAgentsRes;
  const accountSerial = accountSerialRes;
  const rolloverLostThisCycle = Math.max(
    0,
    -((rolloverLostRes ?? []) as Array<{ amount: number }>).reduce((s, r) => s + (r.amount ?? 0), 0),
  );

  const orgDirectory: DirectoryPerson[] = ((orgSettings as any)?.directory ?? []);

  // Términos de servicio: fuente de verdad = organizations.contract_accepted_at.
  // Fallback a voice_agents.contract_accepted_at para demos sin portal_email.
  // Ver [[contract-at-organization-level]].
  const contractAcceptedAt: string | null =
    (orgSettings as { contract_accepted_at?: string | null } | null)?.contract_accepted_at
    ?? (agent as { contract_accepted_at?: string | null }).contract_accepted_at
    ?? null;

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

  // Pool status via helper — src/lib/portal/pool-status.ts. Fuente única de
  // verdad para minutos y tareas: TODAS las vistas del portal usan el mismo
  // fallback ladder. Ver [[feedback-audit-read-path-fidelity]].
  const poolStatus = computePoolStatus({
    acctMins,
    orgSettings,
    acctOps:     acctOpsRes as { ops_used?: number | null; ops_included?: number | null } | null,
    peerAgents:  (opsAgents ?? []) as any[],
    agentFallback: agent as any,
  });
  const {
    minutesIncluded, minutesUsed, minutesRemain, minutesResetDate,
    aiOpsUsed, aiOpsLimit,
  } = poolStatus;

  const minutesPct      = minutesIncluded > 0 ? Math.min((minutesUsed / minutesIncluded) * 100, 100) : 0;
  const minutesColor    = minutesPct > 90 ? '#ef4444' : minutesPct > 70 ? '#f59e0b' : '#22c55e';
  // planBaseMinutes: preferir la suma de credits del ciclo actual (fuente
  // histórica) que refleja renewals + upgrades/downgrades ejecutados este ciclo.
  // Fallback a MINUTES_TIER_CONFIG[current] cuando no hay ledger populado.
  const planCreditsSum = ((planCreditsThisCycleRes ?? []) as Array<{ amount: number }>).reduce(
    (s, r) => s + Math.max(0, r.amount ?? 0), 0);
  const planBaseFromTier = agent.minutes_plan
    ? (MINUTES_TIER_CONFIG[agent.minutes_plan as MinutesTier]?.minutes ?? minutesIncluded)
    : minutesIncluded;
  const planBaseMinutes = planCreditsSum > 0 ? planCreditsSum : planBaseFromTier;
  const rolloverMinutes = Math.max(0, minutesIncluded - planBaseMinutes);
  const resetDate = (() => {
    if (!minutesResetDate) return 'N/A';
    // Formatear en tz del agente (default America/Monterrey). Antes: `new Date`
    // sin zona interpretaba en tz del server (UTC) y luego formateaba en 'es-MX'
    // → cliente en Tijuana o Cancún veía off-by-one entre "renueva el X" y el
    // reset real. Ver [[feedback-audit-read-path-fidelity]].
    const agentTz = (agent as { timezone?: string | null }).timezone ?? 'America/Monterrey';
    const d = new Date(minutesResetDate + 'T12:00:00'); // mediodía evita edge de DST
    const today = new Date(); today.setHours(0, 0, 0, 0);
    while (d < today) d.setMonth(d.getMonth() + 1);
    try {
      return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: agentTz }).format(d);
    } catch {
      // Fallback si el timezone es inválido/desconocido.
      return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    }
  })();

  const aiOpsPct   = aiOpsLimit > 0 ? Math.min((aiOpsUsed / aiOpsLimit) * 100, 100) : 0;
  const aiOpsColor = aiOpsPct > 90 ? '#ef4444' : aiOpsPct > 70 ? '#f59e0b' : '#22c55e';

  // Pérdida de tareas este ciclo: rollover_cap (acumulación bloqueada por 2x)
  // y unused_forfeited (no consumidas en ciclo annual). amounts son negativos en ledger.
  type OpsLossRow = { amount: number; kind: 'rollover_cap' | 'unused_forfeited' };
  const opsLossRows = ((opsLossRes ?? []) as OpsLossRow[]);
  const opsRolloverLost = Math.max(0, -opsLossRows.filter(r => r.kind === 'rollover_cap').reduce((s, r) => s + (r.amount ?? 0), 0));
  const opsUnusedForfeited = Math.max(0, -opsLossRows.filter(r => r.kind === 'unused_forfeited').reduce((s, r) => s + (r.amount ?? 0), 0));

  // ── Fallback banner state ──────────────────────────────────────────────────
  const fallbackPhoneRaw = (orgSettings as any)?.fallback_phone_number ?? null;
  const hasFallback      = isValidE164(fallbackPhoneRaw);
  const exhausted        = minutesIncluded > 0 && minutesUsed >= minutesIncluded;
  const warning80        = minutesIncluded > 0 && minutesUsed >= minutesIncluded * 0.8 && !exhausted;
  const bannerState: 'active' | 'no_fallback' | 'warning' | null =
      exhausted && hasFallback  ? 'active'
    : exhausted && !hasFallback ? 'no_fallback'
    : warning80 && !hasFallback ? 'warning'
    : null;
  const fallbackMasked = hasFallback ? maskPhoneNumber(fallbackPhoneRaw as string) : null;

  const supportWhatsApp    = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '';
  const supportEmail       = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
  const centineliReviewUrl = process.env.NEXT_PUBLIC_CENTINELIA_REVIEW_URL ?? '';

  // accountSerial ya fue fetcheado en Batch 1 arriba

  // ── Data per tab ───────────────────────────────────────────────────────────
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  // Inicio and stats are account-level — include all sibling agents
  const agentIdsForCalls = allClientAgents.length > 0
    ? allClientAgents.map(a => a.id)
    : [agent.id];

  // Action counts — últimos 30d (mismo cutoff que sidebar de /oficina)
  const actionCutoff = new Date(Date.now() - 30 * 86400000).toISOString();

  const [callsRes, leadsRes, ordersRes, apptsRes, allCallsRes, outboundRes, contactOutboundRes, outboundCampaignsRes, emailIntsRes, opsInboxCountRes, humanReqCountRes, learningsCountRes, nextTaskRes] = await Promise.all([
    // Calls — account-level for Inicio activity and Llamadas
    since
      ? supabase.from('voice_calls').select('*').in('agent_id', agentIdsForCalls).gte('created_at', since).order('created_at', { ascending: false }).limit(100)
      : supabase.from('voice_calls').select('*').in('agent_id', agentIdsForCalls).order('created_at', { ascending: false }).limit(100),
    showLeads  ? supabase.from('leads_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showOrders ? supabase.from('orders_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showAppts  ? supabase.from('appointments_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('voice_calls').select('duration_seconds, created_at, outcome').in('agent_id', agentIdsForCalls).order('created_at', { ascending: true }),
    showOutbound ? supabase.from('outbound_calls').select('*').eq('agent_id', agent.id).order('scheduled_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    supabase.from('outbound_contacts').select('id, nombre, telefono, motivo, source, status, fail_count, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('outbound_campaigns').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
    supabase.from('email_integrations').select('provider, email, needs_reauth').eq('agent_id', agent.id),
    // Bandeja (ops_inbox) + human_requests pendientes — cuenta account-level
    supabase.from('ops_inbox').select('id', { count: 'exact', head: true })
      .in('agent_id', agentIdsForCalls)
      .in('status', ['pending', 'escalated', 'info_requested'])
      .gte('created_at', actionCutoff),
    supabase.from('human_requests').select('id', { count: 'exact', head: true })
      .in('agent_id', agentIdsForCalls)
      .in('status', ['pending', 'escalated'])
      .gte('created_at', actionCutoff),
    // Aprendizajes pendientes de aprobar
    agent.portal_email
      ? supabase.from('agent_learnings').select('id', { count: 'exact', head: true })
          .eq('portal_email', agent.portal_email)
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    // Próxima tarea programada
    agent.portal_email
      ? supabase.from('scheduled_agent_tasks')
          .select('id, name, next_run_at, voice_agents!agent_id(agent_name)')
          .eq('portal_email', agent.portal_email)
          .eq('active', true)
          .not('next_run_at', 'is', null)
          .order('next_run_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const calls             = (callsRes.data           ?? []) as VoiceCall[];
  const leads             = leadsRes.data            ?? [];
  const orders            = ordersRes.data           ?? [];
  const appts             = apptsRes.data            ?? [];
  const allCalls          = allCallsRes.data         ?? [];
  const outboundCalls     = (outboundRes.data        ?? []) as OutboundCall[];
  const contactOutbound   = (contactOutboundRes.data ?? []) as ContactOutbound[];
  const outboundCampaigns = outboundCampaignsRes.data  ?? [];
  const reauthAlerts      = (emailIntsRes.data ?? []).filter((i: any) => i.needs_reauth) as { provider: 'gmail' | 'outlook'; email: string }[];

  // Action items counts para el card "Requieren tu acción"
  const bandejaCount   = ((opsInboxCountRes as any).count ?? 0) + ((humanReqCountRes as any).count ?? 0);
  const learningsCount = (learningsCountRes as any).count ?? 0;
  const actionTotal    = bandejaCount + learningsCount + reauthAlerts.length;

  // Próxima tarea programada (para widget al pie de /inicio)
  const nextTaskRaw = (nextTaskRes as any).data as {
    id: string; name: string; next_run_at: string;
    voice_agents?: { agent_name?: string | null } | null;
  } | null;
  const nextTask = nextTaskRaw ? {
    id:        nextTaskRaw.id,
    name:      nextTaskRaw.name,
    nextRunAt: nextTaskRaw.next_run_at,
    agentName: nextTaskRaw.voice_agents?.agent_name ?? 'tu equipo',
  } : null;

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

  // Portal V2 flag ya fue fetcheado en Batch 1 arriba (v2Enabled)

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

  // ─── Briefing ejecutivo: HOY y COMPARACIÓN SEMANAL ──────────────────────
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week1Start = new Date(now.getTime() - 7 * 86400000);
  const week2Start = new Date(now.getTime() - 14 * 86400000);
  const endOfToday = new Date(startOfToday.getTime() + 86400000);

  const apptsHoy = (appts as any[]).filter(a => {
    // Prioridad: starts_at (timestamp real) > fecha_iso (YYYY-MM-DD) > fecha (texto libre)
    const raw = (a.starts_at as string | null) ?? (a.fecha_iso as string | null) ?? (a.fecha as string | null);
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    return d >= startOfToday && d < endOfToday;
  }).sort((a, b) => ((a.hora as string) ?? '').localeCompare((b.hora as string) ?? ''));

  const salientesEnCola = showOutbound ? pendingOutboundCount : 0;

  const allCallsTyped = (allCalls as any[]);
  const callsW1 = allCallsTyped.filter(c => new Date(c.created_at as string) >= week1Start);
  const callsW2 = allCallsTyped.filter(c => {
    const d = new Date(c.created_at as string);
    return d >= week2Start && d < week1Start;
  });
  const leadsW1 = (leads as any[]).filter(l => new Date(l.created_at as string) >= week1Start).length;
  const leadsW2 = (leads as any[]).filter(l => {
    const d = new Date(l.created_at as string);
    return d >= week2Start && d < week1Start;
  }).length;
  const ordersW1 = (orders as any[]).filter(o => new Date(o.created_at as string) >= week1Start).length;
  const ordersW2 = (orders as any[]).filter(o => {
    const d = new Date(o.created_at as string);
    return d >= week2Start && d < week1Start;
  }).length;
  const apptsW1 = (appts as any[]).filter(a => new Date(a.created_at as string) >= week1Start).length;
  const apptsW2 = (appts as any[]).filter(a => {
    const d = new Date(a.created_at as string);
    return d >= week2Start && d < week1Start;
  }).length;
  const RESOLVED_SET = new Set(['info_provided', 'lead_created', 'appointment_booked', 'order_taken', 'escalated_whatsapp', 'other']);
  const autoW1 = callsW1.length > 0 ? Math.round(callsW1.filter(c => RESOLVED_SET.has((c.outcome as string) ?? '')).length / callsW1.length * 100) : 0;
  const autoW2 = callsW2.length > 0 ? Math.round(callsW2.filter(c => RESOLVED_SET.has((c.outcome as string) ?? '')).length / callsW2.length * 100) : 0;

  const trend = (curr: number, prev: number): { delta: number | null; dir: 'up' | 'down' | 'flat' } => {
    if (prev === 0 && curr === 0) return { delta: null, dir: 'flat' };
    if (prev === 0) return { delta: null, dir: 'up' };
    const pct = Math.round(((curr - prev) / prev) * 100);
    return { delta: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  };

  const weeklyMetrics = [
    { label: 'Conversaciones',      curr: callsW1.length, prev: callsW2.length, ...trend(callsW1.length, callsW2.length), unit: '' },
    ...(showLeads   ? [{ label: 'Leads capturados',   curr: leadsW1,  prev: leadsW2,  ...trend(leadsW1, leadsW2),  unit: '' }] : []),
    ...(showAppts   ? [{ label: 'Citas agendadas',    curr: apptsW1,  prev: apptsW2,  ...trend(apptsW1, apptsW2),  unit: '' }] : []),
    ...(showOrders  ? [{ label: 'Pedidos tomados',    curr: ordersW1, prev: ordersW2, ...trend(ordersW1, ordersW2), unit: '' }] : []),
    { label: 'Resolución autónoma', curr: autoW1,         prev: autoW2,         ...trend(autoW1, autoW2),          unit: '%' },
  ];

  // Últimas 3 conversaciones — respondidas, en orden reverso cronológico
  const latestCalls = (calls as any[])
    .filter(c => (c.outcome as string) !== 'unanswered' && (c.outcome as string) !== 'missed')
    .slice(0, 3);

  // Pipeline snapshot: últimos leads, próximas citas, últimos pedidos
  const latestLeads = (leads as any[]).slice(0, 3);
  const upcomingAppts = (appts as any[])
    .filter(a => {
      if (!a.fecha) return false;
      const apptDate = new Date(a.fecha as string);
      return apptDate >= new Date();
    })
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .slice(0, 3);
  const latestOrders = (orders as any[]).slice(0, 3);

  // Snapshot salientes (visible en /inicio si aplica — antes solo en /negocio desktop)
  const outboundSnapshot = showOutbound ? {
    active:  activeOutboundCampaigns,
    pending: pendingOutboundCount,
    lastRun: lastCampaignRunAt,
  } : null;

  const RESOLVED_OUTCOMES = new Set(['info_provided', 'lead_created', 'appointment_booked', 'order_taken', 'escalated_whatsapp', 'other']);
  const resolvedCount  = calls.filter(c => RESOLVED_OUTCOMES.has((c.outcome as string) ?? '')).length;
  const autonomousRate = calls.length > 0 ? Math.round((resolvedCount / calls.length) * 100) : 0;
  const answeredCount  = calls.filter(c => (c.outcome as string) !== 'unanswered' && (c.outcome as string) !== 'missed').length;
  const answeredRate   = calls.length > 0 ? Math.round((answeredCount / calls.length) * 100) : 0;

  const agentTimezone = ((agent as any).timezone as string | null) ?? 'America/Monterrey';
  const localHourStr  = new Date().toLocaleString('en-US', { timeZone: agentTimezone, hour: 'numeric', hour12: false });
  const localHour     = parseInt(localHourStr) || 12;
  const greeting      = localHour < 12 ? 'Buenos días' : localHour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const officeOk      = !!(agent.active) && !clientPaused && !billingPaused;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'inicio',   label: 'Inicio' },
    { id: 'organizacion', label: 'Organización' },
    { id: 'empleados',    label: 'Empleados' },
    { id: 'oficina',  label: 'Oficina' },
    { id: 'cuenta',   label: 'Cuenta' },
    { id: 'equipo',   label: 'Equipo de gestión' },
  ];


  // ── V2 body: design-system shell (outer containers only; inner logic untouched) ──
  const pageBodyV2 = (
    <div className="flex-1 min-w-0 flex flex-col">

      {/* Tab nav — mobile only (unchanged from V1) */}
      <div className="md:hidden" style={{ background: '#ffffff', borderBottom: '1px solid #E8E3F5', position: 'sticky', top: 53, zIndex: 9 }}>
        <div className="px-4 sm:px-6">
          <PortalTabNav token={token} currentTab={tab} tabs={TABS} />
        </div>
      </div>

      {/* Alerts (unchanged from V1) */}
      {(!agent.active || minutesPct > 80) && (
        <div className="px-4 sm:px-6 pt-4 flex flex-col gap-2 max-w-4xl w-full mx-auto md:mx-0">
          {billingPaused && (
            <a href={`/api/billing/portal-session?token=${token}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-opacity hover:opacity-90"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={15} color="#f87171" className="flex-shrink-0" />
              <p className="flex-1 text-sm" style={{ color: '#1A0A3B' }}>
                Este empleado está pausado por falta de pago. Al resolver, solo este empleado se reactiva.
              </p>
              <span className="text-sm font-semibold whitespace-nowrap" style={{ color: '#f87171' }}>Resolver pago</span>
              <ChevronRight size={14} style={{ color: '#f87171', flexShrink: 0 }} />
            </a>
          )}
          {clientPaused && !billingPaused && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle size={15} color="#fbbf24" className="flex-shrink-0" />
              <p className="text-sm" style={{ color: '#1A0A3B' }}>
                Tu empleado está pausado voluntariamente. Puedes reanudarlo cuando quieras desde la pestaña Resumen.
              </p>
            </div>
          )}
          {minutesPct > 80 && agent.active && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertTriangle size={15} color="#fbbf24" className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium" style={{ color: '#1A0A3B' }}>
                  Estás al {Math.round(minutesPct)}% de tus minutos, te quedan {minutesRemain} min
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#fbbf24' }}>Reset el {resetDate}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="flex-1 w-full md:mx-0" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── INICIO (V2 with design system shells) ───────────────── */}
        {tab === 'inicio' && (
          <PageContainer>
            <div className="flex flex-col gap-5">

              {/* Greeting banner — status-aware, keep as-is (styled alert) */}
              <div className="rounded-2xl px-5 py-4"
                style={{ background: officeOk ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${officeOk ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: officeOk ? '#22c55e' : '#ef4444', boxShadow: officeOk ? '0 0 6px #22c55e' : '0 0 6px #ef4444' }} />
                  <p className="text-sm" style={{ color: '#1A0A3B' }}>
                    <span className="font-semibold">{greeting}, {agent.business_name}.</span>{' '}
                    <span style={{ color: '#6B6480' }}>
                      {officeOk ? 'Tu oficina está activa y atendiendo.' : 'Tu oficina está pausada en este momento.'}
                    </span>
                  </p>
                </div>
              </div>

              {isFirstTime && (
                <div
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    background: '#ffffff',
                    border:     '1px solid #E8E3F5',
                    boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
                    minHeight:  96,
                  }}
                >
                  <div style={{ position: 'absolute', bottom: 0, left: 16, width: 160, height: 112, pointerEvents: 'none' }}>
                    <Image src="/meerkats-team.png" alt="" fill sizes="160px"
                      style={{ objectFit: 'contain', objectPosition: 'bottom left' }} />
                  </div>
                  <div style={{ paddingLeft: 196, paddingRight: 20, minHeight: 96, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: '#6C3BFF' }}>Tu equipo está listo</p>
                    <p className="text-xs leading-relaxed" style={{ color: '#6B6480', whiteSpace: 'nowrap' }}>
                      En cuanto llegue la primera llamada, los registros aparecerán aquí automáticamente.
                    </p>
                  </div>
                </div>
              )}

              {/* ═══ BLOQUE 1: CÓMO VA TU SEMANA ═══ */}
              {weeklyMetrics.some(m => m.curr > 0 || m.prev > 0) && (
                <div
                  id="semana"
                  className="flex flex-col rounded-2xl overflow-hidden scroll-mt-6"
                  style={{
                    background: '#ffffff',
                    border:     '1px solid #E8E3F5',
                    boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                    <div>
                      <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Cómo va tu semana</h2>
                      <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>Comparativa vs semana anterior</p>
                    </div>
                  </div>
                  <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {weeklyMetrics.map(m => {
                      const dirColor = m.dir === 'up' ? '#22c55e' : m.dir === 'down' ? '#ef4444' : '#6B6480';
                      const arrow    = m.dir === 'up' ? '▲' : m.dir === 'down' ? '▼' : '·';
                      const deltaSuffix = m.unit === '%' ? 'pp' : '%';
                      return (
                        <div key={m.label}>
                          <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: '#9B8FB5' }}>{m.label}</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold tabular-nums" style={{ color: '#1A0A3B' }}>
                              {m.curr}{m.unit}
                            </p>
                            {m.delta !== null && (
                              <span className="text-xs font-semibold" style={{ color: dirColor }}>
                                {arrow} {m.delta}{deltaSuffix}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>
                            vs {m.prev}{m.unit} semana anterior
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ═══ BLOQUE 2: HOY TIENES QUE ATENDER (surface único) ═══ */}
              {(() => {
                const pendingCount = apptsHoy.length + (bandejaCount > 0 ? 1 : 0) + (salientesEnCola > 0 ? 1 : 0) + (learningsCount > 0 ? 1 : 0) + reauthAlerts.length;
                if (pendingCount === 0 && !hasNox && !nextTask) return null;
                return (
                <div id="hoy" className="flex flex-col rounded-2xl overflow-hidden scroll-mt-6"
                  style={{
                    background: 'linear-gradient(180deg, rgba(108,59,255,0.06) 0%, #ffffff 100%)',
                    border:     '2px solid rgba(108,59,255,0.28)',
                    boxShadow:  '0 4px 20px rgba(108,59,255,0.08)',
                  }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: '#6C3BFF', boxShadow: '0 4px 12px rgba(108,59,255,0.35)' }}>
                        <AlertTriangle size={18} color="#fff" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                          Hoy tienes que atender
                        </h2>
                        {pendingCount > 0 && (
                          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                            {pendingCount} {pendingCount === 1 ? 'asunto pendiente' : 'asuntos pendientes'} de tu revisión
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-4 flex flex-col gap-2.5" style={{ borderTop: '1px solid #F0EDF9' }}>
                    {/* URGENTE: integraciones caídas */}
                    {reauthAlerts.map(alert => (
                      <Link key={alert.provider} href={`/portal/${token}?tab=organizacion#integraciones`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all hover:translate-x-0.5"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#ef4444' }}>
                          <AlertTriangle size={16} color="#fff" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>
                            {alert.provider === 'gmail' ? 'Gmail' : 'Outlook'} requiere reconexión
                          </p>
                          <p className="text-xs truncate" style={{ color: '#6B6480' }}>{alert.email}: el empleado no puede leer correos</p>
                        </div>
                        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: '#ef4444', color: '#fff' }}>Resolver</span>
                      </Link>
                    ))}

                    {/* Citas hoy */}
                    {apptsHoy.length > 0 && (
                      <div className="px-4 py-3 rounded-xl"
                        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: '#3b82f6' }}>
                            <CalendarDays size={16} color="#fff" />
                          </div>
                          <p className="text-sm font-semibold flex-1" style={{ color: '#1A0A3B' }}>
                            {apptsHoy.length} {apptsHoy.length === 1 ? 'cita confirmada hoy' : 'citas confirmadas hoy'}
                          </p>
                        </div>
                        <div className="pl-12 flex flex-col gap-1.5">
                          {apptsHoy.slice(0, 5).map((a: any) => {
                            const nombre = (a.nombre as string | null)?.trim();
                            const telefono = (a.telefono as string | null)?.trim();
                            const displayName = nombre || telefono || 'Sin nombre';
                            const ubicacion = (a.location as string | null)?.trim();
                            const eventId = (a.calendar_event_id as string | null)?.trim();
                            const provider = (a.calendar_provider as string | null)?.trim();
                            // Deep-link al evento del calendario si existe, o al día si no
                            let calUrl: string | null = null;
                            if (eventId && provider === 'gmail') {
                              // Google Calendar acepta el eventId directo (base64url-safe)
                              calUrl = `https://calendar.google.com/calendar/u/0/r/eventedit/${eventId}`;
                            } else if (eventId && provider === 'outlook') {
                              calUrl = `https://outlook.office.com/calendar/item/${encodeURIComponent(eventId)}`;
                            } else if (a.starts_at || a.fecha_iso) {
                              // Fallback: abrir el día en el proveedor conectado (default Google)
                              const d = new Date((a.starts_at as string) ?? (a.fecha_iso as string));
                              if (!isNaN(d.getTime())) {
                                const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
                                calUrl = provider === 'outlook'
                                  ? `https://outlook.office.com/calendar/view/day/${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                                  : `https://calendar.google.com/calendar/u/0/r/day/${y}/${m}/${day}`;
                              }
                            }
                            const content = (
                              <>
                                <span className="font-semibold tabular-nums" style={{ color: '#3b82f6' }}>{(a.hora as string) ?? '·'}</span>
                                <span className="mx-1.5" style={{ color: '#9B8FB5' }}>·</span>
                                <span className="font-medium">{displayName}</span>
                                {a.servicio ? <span style={{ color: '#6B6480' }}> · {a.servicio}</span> : null}
                                {ubicacion ? <span style={{ color: '#6B6480' }}> · {ubicacion}</span> : null}
                                {nombre && telefono ? <span style={{ color: '#9B8FB5' }}> · {telefono}</span> : null}
                              </>
                            );
                            return calUrl ? (
                              <a key={a.id} href={calUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs no-underline transition-opacity hover:opacity-70"
                                style={{ color: '#6B6480' }}>
                                {content}
                              </a>
                            ) : (
                              <p key={a.id} className="text-xs" style={{ color: '#6B6480' }}>
                                {content}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Correos pendientes en bandeja */}
                    {bandejaCount > 0 && (
                      <Link href={`/portal/${token}/oficina/bandeja`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all hover:translate-x-0.5"
                        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#6C3BFF' }}>
                          <Inbox size={16} color="#fff" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                            {bandejaCount} {bandejaCount === 1 ? 'correo espera' : 'correos esperan'} tu aprobación
                          </p>
                          <p className="text-xs" style={{ color: '#6B6480' }}>Borradores, escalaciones y solicitudes</p>
                        </div>
                        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>Ver bandeja</span>
                      </Link>
                    )}

                    {/* Salientes en cola — rutea a Campañas (donde vive el
                        pipeline de contactos por llamar), no a /llamadas
                        (historial de llamadas ya hechas). Bug 2026-08-11:
                        el link etiquetado "Ver campañas" abría el log de
                        llamadas donde el pending contact no aparece porque
                        aún no se marcó — usuario veía página vacía. */}
                    {salientesEnCola > 0 && (
                      <Link href={`/portal/${token}/oficina/campanas`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all hover:translate-x-0.5"
                        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#a855f7' }}>
                          <PhoneOutgoing size={16} color="#fff" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                            {salientesEnCola} {salientesEnCola === 1 ? 'contacto en cola' : 'contactos en cola'}
                          </p>
                          <p className="text-xs" style={{ color: '#6B6480' }}>Campaña saliente activa</p>
                        </div>
                        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: '#a855f7', color: '#fff' }}>Ver campañas</span>
                      </Link>
                    )}

                    {/* Aprendizajes */}
                    {learningsCount > 0 && (
                      <Link href={`/portal/${token}/oficina/aprendizajes`}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all hover:translate-x-0.5"
                        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#22c55e' }}>
                          <Lightbulb size={16} color="#fff" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                            {learningsCount} {learningsCount === 1 ? 'aprendizaje' : 'aprendizajes'} por aprobar
                          </p>
                          <p className="text-xs" style={{ color: '#6B6480' }}>Reglas propuestas por tu equipo</p>
                        </div>
                        <span className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: '#22c55e', color: '#fff' }}>Revisar</span>
                      </Link>
                    )}

                    {/* Brief del día — el label vive dentro del card, no aquí */}
                    {hasNox && (
                      <div className="mt-1 pt-3" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <BriefDelDiaCard />
                      </div>
                    )}

                    {/* Próxima tarea automática (línea discreta al pie) */}
                    {nextTask && (
                      <p className="text-[11px] pt-2 mt-1" style={{ color: '#9B8FB5', borderTop: '1px solid #F0EDF9' }}>
                        <Clock size={10} className="inline-block mr-1" style={{ verticalAlign: '-1px' }} />
                        Próxima tarea automática: <span style={{ color: '#6B6480' }}>{nextTask.name}</span> · {fmtFuture(nextTask.nextRunAt)} · {nextTask.agentName}
                      </p>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Fin de los bloques del briefing — InsightsSection removida, vive en /oficina/aprendizajes */}


            </div>
          </PageContainer>
        )}

        {/* ── NEGOCIO (V2 design system shells) ───────────────────── */}
        {tab === 'organizacion' && (
          <PageContainer>
            <div className="flex flex-col gap-5">

              {/* Header — patrón consistente con /inicio, /agentes, /cuenta */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: '#9B8FB5' }}>
                  TU ORGANIZACIÓN
                </p>
                <h1 className="text-xl font-bold" style={{ color: '#1A0A3B' }}>Configuración del negocio</h1>
                <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
                  Toda la información que tus empleados usan como contexto: perfil, identidad visual, manual y datos de contacto.
                </p>
              </div>

              {(() => {
                // Bloque destacado "Configuración pendiente" — patrón surface único con acento lila.
                // Solo aparece si hay setup crítico sin completar.
                const hasLogo        = !!(agent as any).logo_url;
                const hasDescription = !!(orgSettings?.business_description ?? (agent as any).business_description)?.trim();
                const hasKb          = !!(orgSettings?.knowledge_base ?? (agent as any).knowledge_base)?.trim();
                const hasWebsite     = !!(orgSettings?.brand_website ?? (agent as any).brand_website)?.trim();
                const pending = [
                  !hasLogo        && { label: 'Sube el logo de tu negocio',           anchor: 'organizacion' },
                  !hasDescription && { label: 'Escribe una descripción del negocio',  anchor: 'organizacion' },
                  !hasKb          && { label: 'Redacta el manual de la organización', anchor: 'conocimiento' },
                  !hasWebsite     && { label: 'Agrega tu sitio web',                  anchor: 'sitio'         },
                ].filter(Boolean) as { label: string; anchor: string }[];
                if (pending.length === 0) return null;
                return (
                  <div
                    className="flex flex-col rounded-2xl overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, rgba(108,59,255,0.06) 0%, #ffffff 100%)',
                      border:     '2px solid rgba(108,59,255,0.28)',
                      boxShadow:  '0 4px 20px rgba(108,59,255,0.08)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: '#6C3BFF', boxShadow: '0 4px 12px rgba(108,59,255,0.35)' }}>
                          <AlertTriangle size={18} color="#fff" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                            Configuración pendiente
                          </h2>
                          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                            {pending.length} {pending.length === 1 ? 'ajuste' : 'ajustes'} para completar el perfil del negocio.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="px-5 pb-5 pt-4 flex flex-col gap-2" style={{ borderTop: '1px solid #F0EDF9' }}>
                      {pending.map((p, idx) => (
                        <a key={idx} href={`#${p.anchor}`}
                          className="flex items-center justify-between text-sm no-underline transition-opacity hover:opacity-80"
                          style={{ color: '#1A0A3B' }}>
                          <span>
                            <span style={{ color: '#6C3BFF', marginRight: 6 }}>●</span>
                            {p.label}
                          </span>
                          <span className="text-xs whitespace-nowrap" style={{ color: '#6C3BFF' }}>Configurar →</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <NegocioTabs>
                {/* ── 1. PERFIL ────────────────────────────────────────── */}
                <>
                  <div id="organizacion" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Perfil de la organización</h2>
                            <InfoTooltip text="Datos generales y descripción de tu organización que tus empleados usarán como contexto en todas sus interacciones." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        {agent.portal_email && (
                          <OrgCard token={token} portalEmail={agent.portal_email} logoUrl={(agent as any).logo_url ?? null} initialDescription={orgSettings?.business_description ?? (agent as any).business_description ?? ''} initialBusinessEmail={(orgSettings as any)?.business_email ?? ''} />
                        )}
                      </div>
                    </div>
                  </div>

                  <div id="conocimiento" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Manual de la organización</h2>
                            <InfoTooltip text="Tus empleados consultan esta información en todas sus interacciones: llamadas, correos y mensajes. Incluye servicios, precios, FAQs y cualquier detalle que deban conocer." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <KnowledgeBaseEditor
                          token={token}
                          initialValue={orgSettings?.knowledge_base ?? (agent as any).knowledge_base ?? ''}
                          websiteSynced={!!(orgSettings?.website_knowledge ?? (agent as any).website_knowledge)}
                          hasDescription={!!((orgSettings?.business_description ?? (agent as any).business_description)?.trim())}
                        />
                      </div>
                    </div>
                  </div>

                  <div id="perfil-dueno" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Perfil del responsable</h2>
                            <InfoTooltip text="Cuéntale a tus empleados quién eres, cuáles son tus prioridades y cómo te gusta que se hagan las cosas. Cuanto más sepan de ti, mejor se adaptarán a tu estilo." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <OwnerProfileEditor
                          token={token}
                          initialValue={orgSettings?.owner_profile ?? (agent as any).owner_profile ?? ''}
                        />
                      </div>
                    </div>
                  </div>
                </>

                {/* ── 2. IDENTIDAD ────────────────────────────────────── */}
                <>
                  <div id="branding" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Identidad visual</h2>
                            <InfoTooltip text="Colores, datos de contacto y pie de página que aparecen en todos los correos y documentos que generan tus empleados." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <BrandKitEditor
                          token={token}
                          logoUrl={(agent as any).logo_url ?? null}
                          businessName={agent.business_name}
                          agentName={agent.agent_name ?? agent.business_name}
                          initialColor={orgSettings?.email_brand_color ?? (agent as any).email_brand_color ?? '#6C3BFF'}
                          initialColorSecondary={orgSettings?.brand_color_secondary ?? (agent as any).brand_color_secondary ?? ''}
                          initialWebsite={orgSettings?.brand_website ?? (agent as any).brand_website ?? ''}
                          initialAddress={orgSettings?.brand_address ?? (agent as any).brand_address ?? ''}
                          initialPhone={orgSettings?.brand_phone ?? ''}
                          initialFooter={orgSettings?.email_footer_text ?? (agent as any).email_footer_text ?? ''}
                          senderEmail={(orgSettings as any)?.business_email ?? agent.portal_email ?? null}
                        />
                      </div>
                    </div>
                  </div>

                  <div id="tono-de-marca" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Tono de marca</h2>
                            <InfoTooltip text="Extrae el tono real de tu negocio a partir de muestras (correos previos, copy del sitio, pitch). Todos tus empleados hablarán como tu marca, no con un tono genérico." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <BrandVoiceEditor token={token} initGuide={(orgSettings as any)?.brand_voice_guide ?? ''} />
                      </div>
                    </div>
                  </div>

                  <div id="sitio" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Sitio web y reseñas</h2>
                        </div>
                      </div>
                      <div className="px-5 py-5" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <WebsiteSyncButton token={token} currentUrl={orgSettings?.business_website ?? (agent as any).business_website ?? orgSettings?.brand_website ?? (agent as any).brand_website ?? null} />
                      </div>
                      <div className="px-5 py-5" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <ReviewLinkEditor token={token} initialValue={orgSettings?.google_review_url ?? (agent as any).google_review_url ?? ''} />
                      </div>
                    </div>
                  </div>
                </>

                {/* ── 3. OPERACIÓN ────────────────────────────────────── */}
                <>
                  <div id="horarios" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Horario de atención</h2>
                            <InfoTooltip text="Define los días y horarios en que tu empleado está disponible para atender llamadas." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <BusinessHoursEditor token={token} initialHours={((orgSettings?.business_hours ?? agent.business_hours) ?? null) as BusinessHours | null} />
                      </div>
                    </div>
                  </div>

                  <div id="sheets-crm" style={{ scrollMarginTop: 80 }}>
                    <SheetsMappingsSection token={token} />
                  </div>

                  <div id="disponibilidad-diaria" style={{ scrollMarginTop: 80 }}>
                    <DailyAvailabilityCard token={token} />
                  </div>
                </>

                {/* ── 4. DIRECTORIO ───────────────────────────────────── */}
                <>
                  <div id="directorio" style={{ scrollMarginTop: 80 }}>
                    <div className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <div className="flex items-baseline gap-2">
                            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Personas de la organización</h2>
                            <InfoTooltip text="Responsable, equipo y especialistas. Todos tus empleados comparten este directorio: para identificar llamadas internas, referir contactos y asignar tickets del helpdesk." />
                          </div>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <DirectorioEditor token={token} initial={orgDirectory} isOwner={isOwner} showHelpdeskFields />
                      </div>
                    </div>
                  </div>
                </>

                {/* ── 5. INTEGRACIONES ────────────────────────────────── */}
                <>
                  <div id="integraciones" style={{ scrollMarginTop: 80 }}>
                    <IntegrationsHub
                      token={token}
                      plan={agent.plan as Plan}
                      hasOpsAgent={hasOpsAgent}
                      hasNotion={
                        !!(agent as any).notion_access_token ||
                        (allClientAgents as any[]).some((a: any) => !!a.notion_access_token)
                      }
                    />
                  </div>
                </>
              </NegocioTabs>

            </div>
          </PageContainer>
        )}

        {/* ── CUENTA (V2 design system shells) ────────────────────── */}
        {tab === 'cuenta' && (
          <PageContainer>
            <div className="flex flex-col gap-5">

              {/* Header — patrón consistente con /inicio y /agentes */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: '#9B8FB5' }}>
                  TU CUENTA
                </p>
                <h1 className="text-xl font-bold" style={{ color: '#1A0A3B' }}>Plan y consumo</h1>
                <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
                  Revisa tu uso del mes, compra saldo extra y consulta el historial de movimientos.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">

                {/* ── Col 1: Consumo promedio + Uso + Compras + Recarga + Contratos ── */}
                <div className="flex flex-col gap-5 min-w-0" id="minutos">

                  {/* Consumo promedio — toggle Minutos ↔ Tareas.
                      Guard `> 0`: sin él, un pool en 0 (Solo Tareas o edge case
                      previo al fix del fallback ladder) hacía que cualquier
                      consumo disparara monthHighlight=true → número en rojo
                      con connotación de peligro sin razón. */}
                  <ConsumoPromedioCard
                    minutos={allCalls.length > 0 ? {
                      perDay:   avgMinPerDay,
                      perWeek:  avgMinPerWeek,
                      perMonth: `${avgMinPerMonth}`,
                      monthHighlight: minutesIncluded > 0 && avgMinPerMonth > minutesIncluded * 0.9,
                    } : undefined}
                    tareas={aiOpsLimit > 0 ? {
                      perDay:   avgOpsPerDay,
                      perWeek:  avgOpsPerWeek,
                      perMonth: avgOpsPerMonth,
                      monthHighlight: aiOpsLimit > 0 && avgOpsPerMonth > aiOpsLimit * 0.9,
                    } : undefined}
                  />

                  <div id="uso-del-mes" style={{ scrollMarginTop: '1.5rem' }}>
                  <div id="comprar"      style={{ scrollMarginTop: '1.5rem' }}>
                  <CuentaUsageTabsCard
                      usoContent={
                        <div className="flex flex-col gap-5">
                          {/* Minutos — hero con número grande + barra + meta */}
                          <div>
                            <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Minutos</span>
                              </div>
                              {minutesIncluded > 0 ? (
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[24px] font-bold leading-none tabular-nums tracking-tight" style={{ color: minutesColor }}>
                                    {minutesUsed}
                                  </span>
                                  <span className="text-[13px]" style={{ color: '#9B8FB5' }}>/ {minutesIncluded} min</span>
                                </div>
                              ) : (
                                <span className="text-[13px]" style={{ color: '#9B8FB5' }}>Jornada sin minutos</span>
                              )}
                            </div>
                            <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: '#F0EDF9' }}>
                              <div className="h-2.5 rounded-full transition-all" style={{ width: minutesIncluded > 0 ? `${Math.min(100, minutesPct)}%` : '0%', background: minutesColor }} />
                            </div>
                            {minutesIncluded > 0 && (
                              <div className="flex justify-between text-[11px] mt-2" style={{ color: '#6B6480' }}>
                                <span><strong style={{ color: '#1A0A3B' }}>{minutesRemain}</strong> disponibles</span>
                                <span>Renueva el <strong style={{ color: '#1A0A3B' }}>{resetDate}</strong></span>
                              </div>
                            )}
                            {rolloverMinutes > 0 && (
                              <p className="text-[11px] mt-1" style={{ color: '#6C3BFF' }}>{planBaseMinutes} base + {rolloverMinutes} del mes anterior</p>
                            )}
                            {rolloverLostThisCycle > 0 && (
                              <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
                                {rolloverLostThisCycle} min no acumulados este ciclo por límite de rollover (2× de tu plan base).
                              </p>
                            )}
                            {/* Chip auto-recarga: cliente sabe que Stripe cargará
                                automático cuando el saldo baje. Antes no había
                                indicador en la card principal — cliente se
                                sorprendía con cargo "no esperado" en Stripe. */}
                            {((agent as { auto_refill_enabled?: boolean | null }).auto_refill_enabled ?? false) && (
                              <p className="text-[11px] mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.18)' }}>
                                <span style={{ fontSize: 10 }}>⚡</span>
                                Auto-recarga activa
                                {((agent as { auto_refill_minutes?: number | null }).auto_refill_minutes ?? 0) > 0
                                  ? ` · ${(agent as { auto_refill_minutes?: number | null }).auto_refill_minutes} min cuando baje del umbral`
                                  : ''}
                              </p>
                            )}
                          </div>

                          {aiOpsLimit > 0 && (
                            <div style={{ borderTop: '1px solid #F0EDF9', paddingTop: 20 }}>
                              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Tareas</span>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[24px] font-bold leading-none tabular-nums tracking-tight" style={{ color: aiOpsColor }}>
                                    {aiOpsUsed}
                                  </span>
                                  <span className="text-[13px]" style={{ color: '#9B8FB5' }}>/ {aiOpsLimit}</span>
                                </div>
                              </div>
                              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: '#F0EDF9' }}>
                                <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.min(100, aiOpsPct)}%`, background: aiOpsColor }} />
                              </div>
                              <div className="flex justify-between text-[11px] mt-2" style={{ color: '#6B6480' }}>
                                <span><strong style={{ color: '#1A0A3B' }}>{Math.max(0, aiOpsLimit - aiOpsUsed)}</strong> disponibles</span>
                                <span>Renueva el <strong style={{ color: '#1A0A3B' }}>{resetDate}</strong></span>
                              </div>
                              {opsRolloverLost > 0 && (
                                <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
                                  {opsRolloverLost} tareas no acumuladas este ciclo por límite de rollover (2× de tu plan base).
                                </p>
                              )}
                              {opsUnusedForfeited > 0 && (
                                <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
                                  {opsUnusedForfeited} tareas no consumidas del ciclo anterior, no acumulan al siguiente.
                                </p>
                              )}
                            </div>
                          )}

                          {minutesIncluded === 0 && aiOpsLimit === 0 && (
                            <p className="text-xs" style={{ color: '#6B6480' }}>No hay saldo configurado en esta cuenta.</p>
                          )}
                        </div>
                      }
                      comprarContent={
                        (() => {
                          const warnPct = Math.max(minutesPct, aiOpsPct);
                          return (
                            <>
                              {warnPct >= 70 && (
                                <p className="text-xs flex items-center gap-1.5" style={{ color: warnPct >= 90 ? '#ef4444' : '#f59e0b' }}>
                                  <AlertTriangle size={11} />
                                  {warnPct >= 90 ? 'Saldo bajo, recarga pronto' : 'Tu saldo está bajando'}
                                </p>
                              )}
                              <p className="text-xs" style={{ color: '#6B6480' }}>Se suman al instante. No afectan tu plan mensual.</p>
                              {annualContractInfo ? (
                                <div className="flex flex-col gap-5">
                                  <AnnualContractCallout action="comprar_minutos" folio={annualContractInfo.folio} endDate={annualContractInfo.endDate} isExpired={annualContractInfo.isExpired} />
                                  <div style={{ borderTop: '1px solid #E8E3F5' }} />
                                  <AnnualContractCallout action="comprar_tareas"  folio={annualContractInfo.folio} endDate={annualContractInfo.endDate} isExpired={annualContractInfo.isExpired} />
                                </div>
                              ) : (
                                <div className="flex flex-col gap-5">
                                  <div>
                                    <p className="text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: '#6B6480' }}>Minutos</p>
                                    {bannerState && (
                                      <div className="mb-3">
                                        <FallbackBanner
                                          state={bannerState}
                                          fallbackMasked={fallbackMasked}
                                          agentName={agentName}
                                          configurarHref={`/portal/${token}/configurar`}
                                        />
                                      </div>
                                    )}
                                    <BuyMinutesSection token={token} />
                                  </div>
                                  <div style={{ borderTop: '1px solid #E8E3F5' }} />
                                  <div>
                                    <p className="text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: '#6B6480' }}>Tareas</p>
                                    <BuyOpsSection token={token} />
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()
                      }
                      recargaContent={
                        <>
                          <p className="text-xs" style={{ color: '#6B6480' }}>Activa para recargar automáticamente cuando el saldo baje de un umbral.</p>
                          <AutoRefillSection token={token} />
                        </>
                      }
                    />
                  </div>
                  </div>

                  {/* Contratos y fechas críticas — feature oculto por ahora, código preservado */}
                  {false && (
                    <div id="contratos-internos" className="flex flex-col rounded-2xl overflow-hidden"
                      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                        <div>
                          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Contratos internos</h2>
                        </div>
                      </div>
                      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                        <ContractTrackerSection token={token} />
                      </div>
                    </div>
                  )}

                  {/* Historial de consumo — movido a col 1 (abajo de Consumo/compras/recarga)
                      porque tiene más ancho para respirar y col 2 queda para meta docs. */}
                  <div id="historial" className="flex flex-col rounded-2xl overflow-hidden"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
                      <div>
                        <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Historial de consumo</h2>
                        <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                          Cada movimiento de minutos y tareas del pool, ordenado por fecha.
                        </p>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid #F0EDF9' }}>
                      <div className="relative">
                        <div className="overflow-y-auto" style={{ maxHeight: '640px' }}>
                          {/* Fix M-e audit 2026-08-10: sub-users solo ven detalle de consumo si
                              tienen el módulo 'cuenta'. Owner siempre. Evita leak de billing
                              a colaboradores que solo deberían ver operación. */}
                          {(!session?.isSubUser || (session.modules ?? []).includes('cuenta')) ? (
                            agent.portal_email ? (
                              <HistorialConsumoSection
                                portalEmail={agent.portal_email as string}
                                agentIds={allClientAgents.length > 0 ? allClientAgents.map(a => a.id) : [agent.id]}
                                minutesIncluded={minutesIncluded}
                                callerNames={callerNames}
                                token={token}
                              />
                            ) : (
                              <MinutesLedgerSection agentId={agent.id} minutesIncluded={minutesIncluded} minutesUsed={minutesUsed} callerNames={callerNames} />
                            )
                          ) : (
                            <div className="px-5 py-8 text-center text-[12px]" style={{ color: '#6B6480' }}>
                              El detalle de consumo lo administra el dueño de la cuenta.
                            </div>
                          )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
                          style={{ background: 'linear-gradient(to bottom, transparent, #ffffff)' }} />
                      </div>
                    </div>
                  </div>

                  {/* OpsLedgerSection retirada 2026-08-11: los movimientos de saldo
                      de tareas (grants, refunds, rollover_cap, unused_forfeited,
                      cambios de plan) ahora se muestran unificados dentro de
                      Historial > tab Tareas, arriba del OpsBreakdown/TasksList.
                      Ver [[feedback-audit-read-path-fidelity]] — evita que el
                      cliente vea dos verdades paralelas para el mismo dato. */}
                </div>

                {/* ── Col 2: Reporte mensual (hero) + Términos de servicio ── */}
                <div className="flex flex-col gap-5">
                  {/* Reporte mensual — presencia visual mayor, primera cosa en col 2 */}
                  <div id="reporte-mensual" className="flex flex-col rounded-2xl overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, rgba(108,59,255,0.05) 0%, #ffffff 100%)',
                      border:     '1px solid #E8E3F5',
                      boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
                    }}>
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: '#6C3BFF', boxShadow: '0 4px 12px rgba(108,59,255,0.28)' }}>
                          <FileText size={16} color="#fff" />
                        </div>
                        <div className="flex items-baseline gap-2 min-w-0">
                          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Reporte mensual</h2>
                          <InfoTooltip text="PDF con llamadas, resultados, minutos, horas pico y evolución del mes." />
                        </div>
                      </div>
                      <p className="text-[12px]" style={{ color: '#6B6480' }}>
                        Descarga el resumen del mes en PDF. Ideal para compartir con tu equipo o revisar KPIs.
                      </p>
                    </div>
                    <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
                      <MonthReportPicker token={token} />
                    </div>
                  </div>

                  {/* Términos de servicio — movido a col 2 (referencia legal, no diario) */}
                  <div id="terminos-servicio">
                    <ContractSection
                      token={token}
                      businessName={agent.business_name}
                      signedAt={contractAcceptedAt}
                      contractPreviewUrl={`/portal/${token}/contrato`}
                    />
                  </div>
                </div>

              </div>
            </div>
          </PageContainer>
        )}

      </div>

      <PortalFooter token={token} />
    </div>
  );

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <HashScrollHighlight />
      <div className="min-h-screen relative flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)', overflowX: 'clip' }}>
        <div style={{ position: 'absolute', width: 900, height: 500, top: -320, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse, rgba(108,59,255,0.13) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        {/* Copy leak fix (Scope D3): sub-user sin módulo 'cuenta' NO debe ver
            los KPIs de billing (minutes/ops) en el header. Ocultamos pasando
            0/0 (PortalShell decide si renderizar según valores). */}
        <PortalShell
          token={token}
          businessName={agent.business_name}
          logoUrl={(agent as any).logo_url ?? null}
          hasOpsAgent={hasOpsAgent}
          showOutbound={showOutbound || agent.plan === 'pro'}
          isOwner={isOwner}
          modules={modules}
          minutesRemain={isOwner || (modules ?? []).includes('cuenta') ? minutesRemain : 0}
          minutesIncluded={isOwner || (modules ?? []).includes('cuenta') ? minutesIncluded : 0}
          aiOpsUsed={isOwner || (modules ?? []).includes('cuenta') ? aiOpsUsed : 0}
          aiOpsLimit={isOwner || (modules ?? []).includes('cuenta') ? aiOpsLimit : 0}
          hasStripe={hasStripe}
          accountSerial={accountSerial}
          headerActions={
            <>
              {accountSerial && (
                <div className="hidden sm:flex">
                  <AccountSerialBadge serial={accountSerial} variant="header" onDark />
                </div>
              )}
              <NotificationBell token={token} onDark />
              <PortalLogout onDark />
            </>
          }
          main={pageBodyV2}
        />
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
  // Split "3.3 min" o "771" en número + unidad para tipografía diferenciada
  const match = value.match(/^([\d.,]+)\s*(.*)$/);
  const num  = match?.[1] ?? value;
  const unit = match?.[2] ?? '';
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline gap-1">
        <span
          className="text-[28px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: highlight ? '#ef4444' : '#1A0A3B' }}
        >
          {num}
        </span>
        {unit && (
          <span className="text-[13px] font-medium" style={{ color: highlight ? '#ef4444' : '#9B8FB5' }}>
            {unit}
          </span>
        )}
      </div>
      <div className="text-[11px] font-medium" style={{ color: '#6B6480' }}>{label}</div>
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

function fmtFuture(iso: string): string {
  const target = new Date(iso);
  const diff   = target.getTime() - Date.now();
  if (diff <= 0) return 'ahora';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `en ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const time = target.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  if (hrs < 24)  return `hoy a las ${time}`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return `mañana a las ${time}`;
  if (days < 7)  return `en ${days} días`;
  return target.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
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
