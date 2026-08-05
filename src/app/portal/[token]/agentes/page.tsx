export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { isPortalV2Enabled }            from '@/lib/portal/portal-v2-flag';
import Link                             from 'next/link';
import { Settings2, Bot, Zap, Clock } from 'lucide-react';
import PauseResumeButton               from '../PauseResumeButton';
import AgentAvatarPicker               from '../AgentAvatarPicker';
import MeerkatPicker                   from './MeerkatPicker';
import AnnualContractCallout           from '../AnnualContractCallout';
import AgentRankingSection             from '../AgentRankingSection';
import { COORDINATOR_ROLE_IDS, MEERKAT_MAP } from '@/lib/portal/meerkat-roles';
import type { MeerkatRoleId }          from '@/lib/portal/meerkat-roles';
import { MEERKAT_VOICE_DISTRIBUTION }  from '@/lib/vapi/sync';
import { PageContainer, PageSection, SectionHeader, Card, EmptyState } from '@/components/portal-ui';

interface ToolChip { label: string; color: string }

// Color por tool para los chips de la tabla. Se agrupa por categoría de trabajo
// (verde=captura leads, azul=agenda, cyan=comunicación, etc.) para que el dueño
// escanee rápido las capacidades del empleado.
const TOOL_COLOR: Record<string, string> = {
  // Captura de clientes / leads
  crear_lead: '#22c55e', search_leads: '#22c55e', registrar_pedido: '#f59e0b',
  buscar_cliente: '#9B6DFF', registrar_encuesta: '#a855f7',
  // Agenda / calendario
  agendar_cita: '#3b82f6', list_calendar_events: '#3b82f6',
  create_calendar_event: '#3b82f6', delete_calendar_event: '#3b82f6',
  // Transferencia de llamada
  notificar_transferencia: '#6C3BFF', transferir_llamada: '#6C3BFF',
  // Comunicación saliente
  llamar_a: '#06b6d4', enviar_correo: '#06b6d4',
  // Documentos
  crear_documento: '#06b6d4', create_file: '#06b6d4', create_contract_draft: '#06b6d4',
  buscar_documento_oficina: '#06b6d4', enviar_documento_oficina: '#06b6d4',
  // Drive / archivos externos
  buscar_archivo: '#0891b2', leer_archivo: '#0891b2',
  save_to_drive: '#0891b2', organize_files: '#0891b2',
  // Web e investigación
  buscar_en_web: '#3b82f6', read_url: '#3b82f6',
  // Trabajo en equipo
  consultar_agente: '#0d9488', delegar_tarea: '#0d9488',
  // MercadoLibre
  analizar_publicaciones_ml: '#f59e0b', crear_publicacion_ml: '#f59e0b',
  actualizar_publicacion_ml: '#f59e0b', ver_metricas_ml: '#f59e0b',
  // QuickBooks + fiscal
  qb_consultar_facturas: '#22c55e', qb_buscar_cliente: '#22c55e',
  qb_registrar_pago: '#22c55e', qb_reporte_ingresos: '#22c55e',
  qb_crear_factura: '#22c55e',
  solicitar_factura: '#eab308', consultar_factura: '#eab308',
  // Helpdesk IT
  crear_ticket: '#ef4444', consultar_incidentes: '#ef4444', buscar_directorio: '#ef4444',
  // Municipal
  create_civic_report: '#3b82f6', lookup_civic_report: '#3b82f6', update_civic_report: '#3b82f6',
  // Onboarding
  iniciar_onboarding: '#a855f7',
  // Marca / insights
  extraer_voz_del_cliente: '#c084fc', extraer_tono_de_marca: '#c084fc',
  // Dirección general (exclusivas de coordinadores directores)
  revisar_desempeno_equipo: '#8b5cf6', aprobar_gasto: '#8b5cf6',
  // Cumplimiento / meta
  reportar_falla: '#6b7280', marcar_no_llamar: '#6b7280',
};

// Derivar la tabla del portal desde la única fuente de verdad
// (MEERKAT_VOICE_DISTRIBUTION en sync.ts). Antes había dos listas paralelas
// que se desincronizaban cada vez que se agregaba una tool nueva.
const MEERKAT_TOOL_DISTRIBUTION: Record<string, ToolChip[]> = Object.fromEntries(
  Object.entries(MEERKAT_VOICE_DISTRIBUTION).map(([role, tools]) => [
    role,
    tools.map(name => ({ label: name, color: TOOL_COLOR[name] ?? '#6b7280' })),
  ]),
);


const CAPABILITY_GROUPS: { label: string; color: string; tools: string[] }[] = [
  { label: 'Atiende clientes',      color: '#22c55e', tools: ['crear_lead', 'buscar_cliente', 'registrar_encuesta', 'registrar_pedido'] },
  { label: 'Agenda y citas',        color: '#3b82f6', tools: ['agendar_cita', 'list_calendar_events', 'create_calendar_event', 'delete_calendar_event'] },
  { label: 'Transfiere llamadas',   color: '#6C3BFF', tools: ['notificar_transferencia', 'transferir_llamada'] },
  { label: 'Llama saliente',        color: '#06b6d4', tools: ['llamar_a'] },
  { label: 'Correo y documentos',   color: '#06b6d4', tools: ['enviar_correo', 'crear_documento', 'create_file', 'create_contract_draft', 'buscar_documento_oficina', 'enviar_documento_oficina'] },
  { label: 'Archivos y Drive',      color: '#0891b2', tools: ['buscar_archivo', 'leer_archivo', 'save_to_drive', 'organize_files'] },
  { label: 'Web e investigación',   color: '#3b82f6', tools: ['buscar_en_web', 'read_url', 'search_leads'] },
  { label: 'Trabajo en equipo',     color: '#0d9488', tools: ['consultar_agente', 'delegar_tarea'] },
  { label: 'MercadoLibre',          color: '#f59e0b', tools: ['analizar_publicaciones_ml', 'crear_publicacion_ml', 'actualizar_publicacion_ml', 'ver_metricas_ml'] },
  { label: 'QuickBooks',            color: '#22c55e', tools: ['qb_consultar_facturas', 'qb_buscar_cliente', 'qb_registrar_pago', 'qb_reporte_ingresos', 'qb_crear_factura'] },
  { label: 'Facturación fiscal',    color: '#eab308', tools: ['solicitar_factura', 'consultar_factura'] },
  { label: 'Helpdesk IT',           color: '#ef4444', tools: ['crear_ticket', 'consultar_incidentes', 'buscar_directorio'] },
  { label: 'Servicios municipales', color: '#3b82f6', tools: ['create_civic_report', 'lookup_civic_report', 'update_civic_report'] },
  { label: 'Onboarding y bienvenida', color: '#a855f7', tools: ['iniciar_onboarding'] },
  { label: 'Insights de marca',     color: '#c084fc', tools: ['extraer_voz_del_cliente', 'extraer_tono_de_marca'] },
  { label: 'Dirección general',     color: '#8b5cf6', tools: ['revisar_desempeno_equipo', 'aprobar_gasto'] },
];

const BUSINESS_CATEGORIES: { label: string; color: string; specialized?: boolean; tools: { key: string; label: string }[] }[] = [
  {
    label: 'Ventas',
    color: '#22c55e', // noah
    tools: [
      { key: 'crear_lead',       label: 'Capturar leads' },
      { key: 'registrar_pedido', label: 'Registrar pedidos' },
      { key: 'search_leads',     label: 'Buscar prospectos en internet' },
    ],
  },
  {
    label: 'Atención a clientes',
    color: '#6C3BFF', // nia
    tools: [
      { key: 'buscar_cliente',          label: 'Buscar información de clientes' },
      { key: 'registrar_encuesta',      label: 'Registrar encuestas telefónicas' },
      { key: 'notificar_transferencia', label: 'Avisar al equipo antes de transferir' },
      { key: 'transferir_llamada',      label: 'Transferir llamadas a personas' },
    ],
  },
  {
    label: 'Agenda',
    color: '#ec4899', // naia
    tools: [
      { key: 'agendar_cita',          label: 'Agendar citas' },
      { key: 'list_calendar_events',  label: 'Consultar la agenda' },
      { key: 'create_calendar_event', label: 'Crear eventos en el calendario' },
      { key: 'delete_calendar_event', label: 'Cancelar eventos' },
    ],
  },
  {
    label: 'Comunicación',
    color: '#3b82f6', // nelia
    tools: [
      { key: 'enviar_correo', label: 'Enviar correos electrónicos' },
      { key: 'llamar_a',      label: 'Hacer llamadas salientes' },
    ],
  },
  {
    label: 'Documentos y archivos',
    color: '#0d9488', // nox
    tools: [
      { key: 'crear_documento',       label: 'Crear documentos' },
      { key: 'create_file',           label: 'Crear archivos de texto' },
      { key: 'create_contract_draft', label: 'Redactar contratos' },
      { key: 'buscar_archivo',        label: 'Buscar archivos' },
      { key: 'leer_archivo',          label: 'Leer contenido de archivos' },
      { key: 'save_to_drive',         label: 'Guardar archivos en la nube' },
      { key: 'organize_files',        label: 'Organizar carpetas y archivos' },
    ],
  },
  {
    label: 'Investigación',
    color: '#7c3aed', // niva
    tools: [
      { key: 'buscar_en_web', label: 'Buscar información en internet' },
      { key: 'read_url',      label: 'Leer páginas web' },
    ],
  },
  {
    label: 'Finanzas',
    color: '#f59e0b', // nico
    tools: [
      { key: 'qb_consultar_facturas', label: 'Consultar facturas' },
      { key: 'qb_buscar_cliente',     label: 'Buscar clientes en QuickBooks' },
      { key: 'qb_registrar_pago',     label: 'Registrar pagos recibidos' },
      { key: 'qb_reporte_ingresos',   label: 'Ver reporte de ingresos' },
      { key: 'qb_crear_factura',      label: 'Crear facturas nuevas' },
    ],
  },
  {
    label: 'Colaboración',
    color: '#ef4444', // nova
    tools: [
      { key: 'consultar_agente', label: 'Consultar a otro empleado' },
      { key: 'delegar_tarea',    label: 'Delegar tareas a otro empleado' },
    ],
  },
  {
    label: 'MercadoLibre',
    color: '#22c55e', // noah
    specialized: true,
    tools: [
      { key: 'analizar_publicaciones_ml',  label: 'Analizar publicaciones' },
      { key: 'crear_publicacion_ml',       label: 'Crear publicaciones' },
      { key: 'actualizar_publicacion_ml',  label: 'Actualizar publicaciones' },
      { key: 'ver_metricas_ml',            label: 'Ver métricas de ventas' },
    ],
  },
  {
    label: 'Helpdesk',
    color: '#06b6d4', // neo
    tools: [
      { key: 'crear_ticket',         label: 'Abrir tickets de soporte' },
      { key: 'consultar_incidentes', label: 'Consultar incidentes abiertos' },
      { key: 'buscar_directorio',    label: 'Buscar en el directorio de empleados' },
    ],
  },
  {
    label: 'Servicios municipales',
    color: '#f97316', // nara
    specialized: true,
    tools: [
      { key: 'create_civic_report', label: 'Registrar reporte ciudadano' },
      { key: 'lookup_civic_report', label: 'Consultar estado de reporte' },
      { key: 'update_civic_report', label: 'Actualizar reporte ciudadano' },
    ],
  },
];

function getAgentCapabilities(tools: ToolChip[]): { label: string; color: string }[] {
  const names = new Set(tools.map(t => t.label));
  return CAPABILITY_GROUPS.filter(g => g.tools.some(t => names.has(t)));
}

function getAgentTools(features: Record<string, unknown>): ToolChip[] {
  const meerkatId = (features.meerkat_role_id as string | null) ?? null;
  if (meerkatId && meerkatId !== 'custom' && MEERKAT_TOOL_DISTRIBUTION[meerkatId]) {
    return MEERKAT_TOOL_DISTRIBUTION[meerkatId];
  }
  // Fallback for custom agents
  const tools: ToolChip[] = [];
  if (features.lead_qualification)                                tools.push({ label: 'crear_lead',              color: '#22c55e' });
  if (features.appointment_booking)                               tools.push({ label: 'agendar_cita',            color: '#3b82f6' });
  if (features.order_taking)                                      tools.push({ label: 'registrar_pedido',        color: '#f59e0b' });
  if (features.existing_client_support || features.client_memory) tools.push({ label: 'buscar_cliente',          color: '#9B6DFF' });
  if (features.smart_transfer)                                    tools.push({ label: 'notificar_transferencia', color: '#6C3BFF' });
  if (features.smart_transfer)                                    tools.push({ label: 'transferir_llamada',      color: '#6C3BFF' });
  if (features.helpdesk)                                          tools.push({ label: 'crear_ticket',            color: '#ef4444' });
  if (features.helpdesk)                                          tools.push({ label: 'consultar_incidentes',    color: '#ef4444' });
  if (features.helpdesk)                                          tools.push({ label: 'buscar_directorio',       color: '#ef4444' });
  if (features.of_encuestas)                                      tools.push({ label: 'registrar_encuesta',      color: '#a855f7' });
  tools.push({ label: 'consultar_agente', color: '#0d9488' });
  tools.push({ label: 'reportar_falla',   color: '#6b7280' });
  return tools;
}

const COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
function agentColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

interface Props { params: Promise<{ token: string }> }

export default async function AgentesPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: baseAgent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, plan, minutes_plan')
    .eq('portal_token', token)
    .single();
  if (!baseAgent) notFound();

  if (session?.portalEmail && baseAgent.portal_email && baseAgent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  const lookupEmail = session?.portalEmail ?? baseAgent.portal_email ?? null;

  const { data: agentsRaw } = lookupEmail
    ? await supabase
        .from('voice_agents')
        .select('id, agent_name, role, plan, phone_number, active, client_paused, billing_status, portal_token, features, business_name, ai_ops_used, jornada_type')
        .eq('portal_email', lookupEmail)
        .neq('billing_status', 'pendiente_pago')
        .order('created_at', { ascending: true })
    : { data: [] };

  const agentsUnsorted = agentsRaw ?? [];

  function agentSortKey(a: { features: unknown }): number {
    const mid = ((a.features as any)?.meerkat_role_id as string | null) ?? null;
    if (mid && (COORDINATOR_ROLE_IDS as readonly string[]).includes(mid)) return 0;
    if ((a.features as any)?.receptionist) return 1;
    return 2;
  }

  const agents = [...agentsUnsorted].sort((a, b) => agentSortKey(a) - agentSortKey(b));

  // Calls this month per agent
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const callCounts = await Promise.all(agents.map(async a => {
    const { count } = await supabase
      .from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', a.id)
      .gte('created_at', monthStart.toISOString());
    return { id: a.id, count: count ?? 0 };
  }));
  const callCountMap = Object.fromEntries(callCounts.map(c => [c.id, c.count]));

  const { data: orgRow } = baseAgent.portal_email
    ? await supabase.from('organizations').select('owner_passphrase, billing_model, active_contract_id').eq('portal_email', baseAgent.portal_email).single()
    : { data: null };
  const hasPassphrase = !!orgRow?.owner_passphrase?.trim();

  // Anual: si la org está en contrato prepagado, no se puede autocontratar por Stripe.
  const billingModel = (orgRow?.billing_model as string | null) ?? 'stripe';
  const isAnnualOrExpired = billingModel === 'annual_prepaid' || billingModel === 'expired';
  let annualContractInfo: { folio: string; endDate: string; isExpired: boolean } | null = null;
  if (isAnnualOrExpired) {
    // Última contrato activo o expirado más reciente
    const { data: latestContract } = await supabase
      .from('annual_contracts')
      .select('contract_folio, end_date')
      .eq('organization_email', baseAgent.portal_email!)
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

  // Tool coverage by business category
  const coveredToolKeys = new Set<string>();
  const toolAgentMap: Record<string, string[]> = {};
  for (const a of agents) {
    const agentName = (a.agent_name as string | null) ?? 'Empleado';
    for (const t of getAgentTools((a.features as Record<string, unknown>) ?? {})) {
      coveredToolKeys.add(t.label);
      if (!toolAgentMap[t.label]) toolAgentMap[t.label] = [];
      if (!toolAgentMap[t.label].includes(agentName)) toolAgentMap[t.label].push(agentName);
    }
  }
  // Which meerkat roles can provide each tool (for uncovered suggestions)
  const toolRoleMap: Record<string, string[]> = {};
  for (const [roleId, tools] of Object.entries(MEERKAT_TOOL_DISTRIBUTION)) {
    const role = MEERKAT_MAP[roleId as MeerkatRoleId];
    if (!role) continue;
    for (const t of tools) {
      if (!toolRoleMap[t.label]) toolRoleMap[t.label] = [];
      if (!toolRoleMap[t.label].includes(role.nombre)) toolRoleMap[t.label].push(role.nombre);
    }
  }
  const categoryStats = BUSINESS_CATEGORIES.map(cat => ({
    label:       cat.label,
    color:       cat.color,
    specialized: !!cat.specialized,
    tools:       cat.tools.map(t => ({
      key:            t.key,
      label:          t.label,
      covered:        coveredToolKeys.has(t.key),
      agents:         toolAgentMap[t.key] ?? [],
      suggestedRoles: toolRoleMap[t.key] ?? [],
    })),
    covered:     cat.tools.filter(t => coveredToolKeys.has(t.key)).length,
    total:       cat.tools.length,
  }));
  const coreStats       = categoryStats.filter(c => !c.specialized);
  const specializedStats = categoryStats.filter(c => c.specialized);
  const totalBizTools   = coreStats.reduce((s, c) => s + c.total, 0);
  const coveredBizTotal = coreStats.reduce((s, c) => s + c.covered, 0);
  const overallPct      = totalBizTools > 0 ? Math.round((coveredBizTotal / totalBizTools) * 100) : 0;
  const missingCats     = coreStats.filter(c => c.covered < c.total);

  // Per-meerkat recommendation: which roles cover missing categories, and what they add
  const meerkatRecs = missingCats.length > 0
    ? Object.entries(MEERKAT_TOOL_DISTRIBUTION)
        .map(([roleId, tools]) => {
          const toolKeySet = new Set(tools.map(t => t.label));
          const newCats = missingCats
            .filter(cat => cat.tools.some(t => !t.covered && toolKeySet.has(t.key)))
            .map(cat => ({
              label:    cat.label,
              color:    cat.color,
              newTools: cat.tools.filter(t => !t.covered && toolKeySet.has(t.key)).map(t => t.label),
            }));
          if (newCats.length === 0) return null;
          const allCaps = CAPABILITY_GROUPS
            .filter(g => g.tools.some(toolName => toolKeySet.has(toolName)))
            .map(g => ({ label: g.label, color: g.color }));
          return { roleId, newCats, allCaps };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  // V2 flag
  const v2Enabled = baseAgent.portal_email
    ? await isPortalV2Enabled(baseAgent.portal_email)
    : false;

  // ─── Shared inner content ────────────────────────────────────────────────────
  // Agent cards grid + capability banner are rendered identically in V1 and V2.
  // Only the outer wrapper (header section + container) differs.

  const agentCardsGrid = (
    <div id="lista-agentes" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map(a => {
        const color           = agentColor(a.id);
        const initial         = ((a.agent_name as string | null)?.trim() || (a.business_name as string)).charAt(0).toUpperCase();
        const isBillingPaused = !(a.active as boolean) && (a.billing_status as string) === 'pago_fallido';
        const isClientPaused  = !!(a.client_paused as boolean) && !isBillingPaused;
        const isOnline        = (a.active as boolean) && !isClientPaused && !isBillingPaused;
        const hasRole         = !!((a.role as string | null)?.trim());
        const roleColor       = ((a.features as any)?.role_color as string | null) || '#6C3BFF';
        const avatarSrc       = ((a.features as any)?.avatar as string | null) || null;
        const meerkatId       = ((a.features as any)?.meerkat_role_id as string | null) || null;
        const avatarLocked    = !!meerkatId && meerkatId !== 'custom';
        const isCoordinator   = !!meerkatId && (COORDINATOR_ROLE_IDS as readonly string[]).includes(meerkatId);
        const callCount       = callCountMap[a.id] ?? 0;

        const statusLabel = isBillingPaused ? 'Pago pendiente' : isClientPaused ? 'Pausado' : isOnline ? 'Activo' : 'Inactivo';
        const statusColor = isBillingPaused ? '#dc2626' : isClientPaused ? '#f59e0b' : isOnline ? '#16a34a' : '#6b7280';

        const jornadaType  = ((a as any).jornada_type as string) ?? 'combinada';
        const JORNADA_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
          combinada: { label: 'Combinada',    icon: <><Clock size={10} /><Zap size={10} /></>, color: '#6C3BFF', bg: 'rgba(108,59,255,0.08)', border: 'rgba(108,59,255,0.2)' },
          minutos:   { label: 'Solo minutos', icon: <Clock size={10} />,                       color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)'  },
          tareas:    { label: 'Solo tareas',  icon: <Zap size={10} />,                         color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)'  },
        };
        const jornada = JORNADA_META[jornadaType] ?? JORNADA_META['combinada'];

        const meerkatDef    = meerkatId ? MEERKAT_MAP[meerkatId as MeerkatRoleId] ?? null : null;
        const agentFeatures = (a.features as Record<string, unknown>) ?? {};
        const tools         = getAgentTools(agentFeatures);
        const capabilities  = getAgentCapabilities(tools);

        return (
          <div key={a.id}
            className="rounded-2xl flex flex-col"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

            {/* Color bar */}
            <div style={{ height: 3, borderRadius: '12px 12px 0 0', background: `linear-gradient(90deg, ${hasRole ? roleColor : color}, ${hasRole ? roleColor : color}55)` }} />

            <div className="p-5 flex flex-col items-center gap-4 flex-1">

              {/* Avatar — grande, centrado arriba */}
              <div className="relative">
                <AgentAvatarPicker
                  token={a.portal_token as string}
                  avatarSrc={avatarSrc}
                  initial={initial}
                  color={hasRole ? roleColor : color}
                  size={120}
                  locked={avatarLocked}
                />
                <span
                  className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shadow-sm whitespace-nowrap"
                  style={{ background: jornada.bg, border: `1px solid ${jornada.border}`, color: jornada.color, backdropFilter: 'blur(4px)' }}>
                  {jornada.icon}
                  {jornada.label}
                </span>
              </div>

              {/* Nombre + rol + estado */}
              <div className="flex flex-col items-center gap-1 text-center w-full">
                <span className="font-bold text-base sm:text-lg leading-tight" style={{ color: 'var(--c-text)' }}>
                  {(a.agent_name as string | null)?.trim() || 'Centinelia'}
                </span>
                {hasRole && (
                  <span className="text-sm font-medium" style={{ color: roleColor }}>
                    {a.role as string}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs mt-0.5" style={{ color: statusColor }}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOnline ? 'animate-pulse' : ''}`}
                    style={{ background: 'currentColor' }} />
                  {statusLabel}
                </span>
              </div>

              {/* Descripción + capacidades — siempre al fondo del cuerpo */}
              <div className="flex flex-col gap-3 flex-1 justify-end w-full">
              {meerkatDef?.descripcion && (
                <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                  {meerkatDef.descripcion}
                </p>
              )}

              {/* Capacidades — colapsadas por defecto */}
              {capabilities.length > 0 && (
                <details className="w-full group">
                  <summary
                    className="cursor-pointer list-none select-none flex items-center gap-1.5 w-fit"
                    style={{ WebkitAppearance: 'none' } as React.CSSProperties}>
                    <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-4)' }}>
                      Ver capacidades
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>▸</span>
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {capabilities.map(c => (
                      <span key={c.label}
                        className="text-[11px] font-medium px-2.5 py-0.5 rounded-lg"
                        style={{
                          background: `${c.color}10`,
                          color:      c.color,
                          border:     `1px solid ${c.color}25`,
                        }}>
                        {c.label}
                      </span>
                    ))}
                    {isCoordinator && !hasPassphrase && (
                      <p className="w-full text-[10px] mt-1 leading-relaxed" style={{ color: '#f59e0b' }}>
                        Sin passphrase del dueño este director no puede actuar. Configura una en Empleados → Configurar.
                      </p>
                    )}
                  </div>
                </details>
              )}
              </div>{/* end description+capacidades wrapper */}

              {/* Stats */}
              <div className="flex items-center justify-center gap-4 w-full" style={{ color: 'var(--c-text-3)' }}>
                {!isCoordinator && (
                  <span className="flex items-center gap-1 text-xs">
                    <Bot size={12} />
                    {callCount} llam. este mes
                  </span>
                )}
                {hasRole && (
                  <span className="flex items-center gap-1 text-xs">
                    <Zap size={12} />
                    {(a.ai_ops_used as number) ?? 0} tareas este mes
                  </span>
                )}
              </div>

            </div>

            {/* Botones — abajo */}
            <div className="flex items-center px-4 py-3 gap-2" style={{ borderTop: '1px solid var(--c-border)' }}>
              <div className="flex-1 flex justify-start min-w-0">
                <Link
                  href={`/portal/${a.portal_token as string}/configurar`}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: `${color}12`, color, border: `1px solid ${color}30` }}
                >
                  <Settings2 size={11} />
                  <span className="inline sm:hidden xl:inline">Configurar</span>
                </Link>
              </div>
              <div className="flex-1 flex justify-end min-w-0">
                {!isBillingPaused
                  ? <PauseResumeButton agentId={a.id} clientPaused={isClientPaused} />
                  : (
                    <a
                      href={`/api/billing/portal-session?token=${a.portal_token as string}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <span className="inline sm:hidden xl:inline">Resolver pago</span>
                      <span className="hidden sm:inline xl:hidden">→</span>
                      <span className="inline sm:hidden xl:inline">→</span>
                    </a>
                  )
                }
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const capabilityBanner = agents.length > 0 ? (
    <div className="rounded-2xl p-5"
      style={{
        background: overallPct === 100 ? 'rgba(34,197,94,0.04)'        : 'rgba(108,59,255,0.04)',
        border:     overallPct === 100 ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(108,59,255,0.18)',
      }}>

      {/* Header row: coverage label + areas + % + progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Cobertura funcional
          </p>
          {overallPct < 100 && missingCats.length > 0 && (
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--c-text-2)' }}>
              Sin cubrir:{' '}
              {missingCats.length <= 3
                ? missingCats.map(c => c.label).join(', ')
                : `${missingCats.slice(0, 3).map(c => c.label).join(', ')} y ${missingCats.length - 3} más`}
            </p>
          )}
          {overallPct === 100 && (
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>
              Tu equipo cubre todas las áreas funcionales.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-sm font-bold px-2.5 py-1 rounded-lg"
            style={{
              background: overallPct === 100 ? 'rgba(34,197,94,0.1)' : 'rgba(108,59,255,0.1)',
              color:      overallPct === 100 ? '#16a34a' : '#6C3BFF',
            }}>
            {overallPct}%
          </span>
          <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
            <div className="h-1.5 rounded-full"
              style={{ width: `${overallPct}%`, background: overallPct === 100 ? '#16a34a' : '#6C3BFF' }} />
          </div>
        </div>
      </div>

      {/* Core categories — 3 columnas */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-0">
        {coreStats.map(cat => (
          <details key={cat.label}>
            <summary
              className="cursor-pointer list-none select-none flex items-center gap-1.5 py-1.5 px-1 rounded-lg transition-colors"
              style={{ WebkitAppearance: 'none' } as React.CSSProperties}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
              <span className="text-[11px] font-medium flex-1 truncate" style={{ color: 'var(--c-text-2)' }}>
                {cat.label}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                  <div className="h-1 rounded-full" style={{ width: `${Math.round((cat.covered / cat.total) * 100)}%`, background: cat.covered === cat.total ? '#16a34a' : cat.color }} />
                </div>
                <span className="text-[10px] tabular-nums w-6 text-right" style={{ color: 'var(--c-text-4)' }}>
                  {Math.round((cat.covered / cat.total) * 100)}%
                </span>
              </div>
              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>▸</span>
            </summary>
            <div className="ml-3 mt-0.5 mb-1.5 flex flex-col gap-0.5">
              {cat.tools.map(t => (
                <div key={t.key} className="flex items-center gap-1 py-0.5">
                  <span className="text-[10px] w-3 text-center flex-shrink-0"
                    style={{ color: t.covered ? '#16a34a' : 'var(--c-text-4)' }}>
                    {t.covered ? '✓' : '○'}
                  </span>
                  <span className="group/cap relative text-[10px] leading-tight cursor-default"
                    style={{ color: t.covered ? 'var(--c-text-2)' : 'var(--c-text-4)' }}>
                    {t.label}
                    {(t.covered ? t.agents.length > 0 : t.suggestedRoles.length > 0) && (
                      <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-50 hidden group-hover/cap:inline-block">
                        <span className="rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap shadow-md"
                          style={{
                            background: 'var(--c-surface-2, #1e1a2e)',
                            border:     `1px solid ${t.covered ? 'var(--c-border)' : 'rgba(108,59,255,0.35)'}`,
                            color:      t.covered ? 'var(--c-text-1)' : '#9B6DFF',
                          }}>
                          {t.covered
                            ? t.agents.join(' · ')
                            : `Disponible en: ${t.suggestedRoles.slice(0, 3).join(', ')}`}
                        </span>
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* Módulos adicionales */}
      <div className="pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-1.5" style={{ color: 'var(--c-text-4)' }}>
          Módulos adicionales
        </p>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0">
          {specializedStats.map(cat => (
            <details key={cat.label}>
              <summary
                className="cursor-pointer list-none select-none flex items-center gap-1.5 py-1.5 px-1 rounded-lg transition-colors"
                style={{ WebkitAppearance: 'none' } as React.CSSProperties}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-60" style={{ background: cat.color }} />
                <span className="text-[11px] font-medium flex-1 truncate" style={{ color: 'var(--c-text-3)' }}>
                  {cat.label}
                </span>
                <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>
                  {cat.covered}/{cat.total}
                </span>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--c-text-4)' }}>▸</span>
              </summary>
              <div className="ml-3 mt-0.5 mb-1.5 flex flex-col gap-0.5">
                {cat.tools.map(t => (
                  <div key={t.key} className="flex items-center gap-1 py-0.5">
                    <span className="text-[10px] w-3 text-center flex-shrink-0"
                      style={{ color: t.covered ? '#16a34a' : 'var(--c-text-4)' }}>
                      {t.covered ? '✓' : '○'}
                    </span>
                    <span className="group/cap relative text-[10px] leading-tight cursor-default"
                      style={{ color: t.covered ? 'var(--c-text-3)' : 'var(--c-text-4)' }}>
                      {t.label}
                      {(t.covered ? t.agents.length > 0 : t.suggestedRoles.length > 0) && (
                        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-50 hidden group-hover/cap:inline-block">
                          <span className="rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap shadow-md"
                            style={{
                              background: 'var(--c-surface-2, #1e1a2e)',
                              border:     `1px solid ${t.covered ? 'var(--c-border)' : 'rgba(108,59,255,0.35)'}`,
                              color:      t.covered ? 'var(--c-text-1)' : '#9B6DFF',
                            }}>
                            {t.covered
                              ? t.agents.join(' · ')
                              : `Disponible en: ${t.suggestedRoles.slice(0, 3).join(', ')}`}
                          </span>
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* CTA */}
      {missingCats.length > 0 && !annualContractInfo && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <MeerkatPicker
            token={token}
            plan={(baseAgent.plan ?? 'pro') as 'pro'}
            defaultTier={(baseAgent.minutes_plan ?? 'starter') as any}
            recommendations={meerkatRecs}
          />
        </div>
      )}
    </div>
  ) : null;

  // ─── V1 body (unchanged legacy layout) ──────────────────────────────────────
  const pageBodyV1 = (
    <div className="flex flex-col gap-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>Mis Empleados</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {agents.length} {agents.length === 1 ? 'empleado' : 'empleados'} · {baseAgent.business_name}
          </p>
        </div>
        {!annualContractInfo && (
          <MeerkatPicker
            token={token}
            plan={(baseAgent.plan ?? 'pro') as 'pro'}
            defaultTier={(baseAgent.minutes_plan ?? 'starter') as any}
            recommendations={meerkatRecs}
          />
        )}
      </div>

      {annualContractInfo && (
        <AnnualContractCallout
          action="contratar_empleado"
          folio={annualContractInfo.folio}
          endDate={annualContractInfo.endDate}
          isExpired={annualContractInfo.isExpired}
        />
      )}

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 rounded-2xl"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
            <Bot size={22} style={{ color: '#6C3BFF', opacity: 0.5 }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin empleados en tu cuenta</p>
        </div>
      )}

      {/* Agent cards */}
      {agentCardsGrid}

      {/* Banner cobertura de capacidades */}
      {capabilityBanner}

      {/* Ranking del equipo */}
      <AgentRankingSection token={token} />

    </div>
  );

  // ─── V2 body (design system shell) ──────────────────────────────────────────
  const pageBodyV2 = (
    <PageContainer>

      <PageSection
        heading={
          <SectionHeader
            as="h1"
            title="Mis Empleados"
            description={`${agents.length} ${agents.length === 1 ? 'empleado' : 'empleados'} · ${baseAgent.business_name}`}
            right={
              !annualContractInfo ? (
                <MeerkatPicker
                  token={token}
                  plan={(baseAgent.plan ?? 'pro') as 'pro'}
                  defaultTier={(baseAgent.minutes_plan ?? 'starter') as any}
                  recommendations={meerkatRecs}
                />
              ) : undefined
            }
          />
        }
      >
        {annualContractInfo && (
          <AnnualContractCallout
            action="contratar_empleado"
            folio={annualContractInfo.folio}
            endDate={annualContractInfo.endDate}
            isExpired={annualContractInfo.isExpired}
          />
        )}

        {/* Empty state */}
        {agents.length === 0 && (
          <Card>
            <EmptyState
              icon={Bot}
              title="Sin empleados en tu cuenta"
              size="md"
            />
          </Card>
        )}

        {/* Agent cards */}
        {agents.length > 0 && agentCardsGrid}

        {/* Banner cobertura de capacidades */}
        {capabilityBanner}

      </PageSection>

    </PageContainer>
  );

  if (v2Enabled) return pageBodyV2;
  return pageBodyV1;
}
