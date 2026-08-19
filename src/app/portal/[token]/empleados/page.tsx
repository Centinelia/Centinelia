export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken }     from '@/lib/portal/org-token';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import Link                             from 'next/link';
import { Settings2, Bot, Zap, Clock, AlertTriangle, Users, PhoneCall, Sparkles, Layers, Mail } from 'lucide-react';
import PauseResumeButton               from '../PauseResumeButton';
import AgentAvatarPicker               from '../AgentAvatarPicker';
import MeerkatPicker                   from './MeerkatPicker';
import Meerkat                         from '@/components/icons/Meerkat';
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
  qb_crear_cotizacion: '#22c55e', qb_registrar_gasto: '#22c55e', qb_registrar_caja_chica: '#22c55e',
  solicitar_factura: '#eab308', consultar_factura: '#eab308',
  // Pack ciclo OC-CFDI (Nala + Nox) — color marrón dorado de Nala
  qb_crear_orden_compra: '#a16207', qb_consultar_orden_compra: '#a16207', qb_descargar_oc_pdf: '#a16207',
  qb_crear_orden_compra_desde_cotizacion: '#a16207',
  firmar_oc: '#a16207', sf_timbrar_desde_oc: '#a16207',
  enviar_oc_a_firma_humana: '#a16207', enviar_oc_a_pagos: '#a16207',
  registrar_comprobante_pago: '#a16207', enviar_oc_a_proveedor: '#a16207',
  archivar_expediente: '#a16207',
  sf_cancelar_cfdi: '#a16207', sf_consultar_estado_sat: '#a16207',
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
  { label: 'QuickBooks',            color: '#22c55e', tools: ['qb_consultar_facturas', 'qb_buscar_cliente', 'qb_registrar_pago', 'qb_reporte_ingresos', 'qb_crear_factura', 'qb_crear_cotizacion', 'qb_registrar_gasto', 'qb_registrar_caja_chica'] },
  { label: 'Facturación fiscal',    color: '#eab308', tools: ['solicitar_factura', 'consultar_factura'] },
  // Pack ciclo OC-CFDI dividido en 5 capacidades legibles para los chips del card.
  // Antes era un solo grupo "Ciclo OC-CFDI" que en el card se veía como una sola capacidad
  // sin decir qué hace realmente. Ahora Nala muestra 5 chips distintos.
  { label: 'Crea órdenes de compra',    color: '#a16207', tools: ['qb_crear_orden_compra', 'qb_consultar_orden_compra', 'qb_descargar_oc_pdf', 'qb_crear_orden_compra_desde_cotizacion'] },
  { label: 'Firma y autoriza OCs',      color: '#a16207', tools: ['firmar_oc', 'enviar_oc_a_firma_humana'] },
  { label: 'Coordina pagos',            color: '#a16207', tools: ['enviar_oc_a_pagos', 'registrar_comprobante_pago', 'enviar_oc_a_proveedor'] },
  { label: 'Timbra y cancela CFDIs',    color: '#a16207', tools: ['sf_timbrar_desde_oc', 'sf_cancelar_cfdi', 'sf_consultar_estado_sat'] },
  { label: 'Archivo fiscal',            color: '#a16207', tools: ['archivar_expediente'] },
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
      { key: 'qb_crear_cotizacion',   label: 'Crear cotizaciones para clientes' },
      { key: 'qb_registrar_gasto',    label: 'Registrar gastos' },
      { key: 'qb_registrar_caja_chica', label: 'Registrar gastos de caja chica' },
    ],
  },
  {
    label: 'Facturación',
    color: '#a16207', // nala
    tools: [
      { key: 'qb_crear_orden_compra_desde_cotizacion', label: 'Crear OC desde cotización de proveedor (Vision AI)' },
      { key: 'qb_crear_orden_compra',                   label: 'Crear orden de compra en QuickBooks' },
      { key: 'qb_consultar_orden_compra',               label: 'Consultar estado de una OC' },
      { key: 'qb_descargar_oc_pdf',                     label: 'Descargar PDF de la OC' },
      { key: 'firmar_oc',                               label: 'Firmar OC (autofirma o escalar a humano)' },
      { key: 'enviar_oc_a_firma_humana',                label: 'Escalar OC al autorizador por correo' },
      { key: 'enviar_oc_a_pagos',                       label: 'Enviar OC firmada al depto de pagos' },
      { key: 'registrar_comprobante_pago',              label: 'Registrar comprobante de transferencia' },
      { key: 'enviar_oc_a_proveedor',                   label: 'Enviar OC + comprobante al proveedor' },
      { key: 'sf_timbrar_desde_oc',                     label: 'Timbrar CFDI copiando conceptos de la OC' },
      { key: 'sf_cancelar_cfdi',                        label: 'Cancelar CFDI ante el SAT' },
      { key: 'sf_consultar_estado_sat',                 label: 'Consultar estado de cancelación en SAT' },
      { key: 'archivar_expediente',                     label: 'Archivar XML+PDF+acuse en el destino configurado' },
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
    specialized: true,
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
  const baseAgent = await getPrimaryAgentFromToken<{ portal_email: string | null; business_name: string; plan: string | null; minutes_plan: string | null }>(
    token,
    'portal_email, business_name, plan, minutes_plan',
    supabase,
  );
  if (!baseAgent) notFound();

  if (session?.portalEmail && baseAgent.portal_email && baseAgent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  // NOTA: || (no ??) porque en dev verifySession puede devolver portalEmail: ''
  // (string vacío) cuando no hay DEV_PORTAL_EMAIL en .env.local. `??` no cae
  // al fallback con '' (no es nullish), lo que rompía la lista de empleados.
  const lookupEmail = session?.portalEmail || baseAgent.portal_email || null;

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

  // Fix N+1 2026-08-10: antes hacía 1 query de count POR agente en paralelo.
  // Con N agentes = N queries. Ahora 1 query con .in() + agrupamos en memoria.
  const agentIds = agents.map(a => a.id);
  const { data: monthCalls } = agentIds.length > 0
    ? await supabase.from('voice_calls').select('agent_id')
        .in('agent_id', agentIds)
        .gte('created_at', monthStart.toISOString())
    : { data: [] };
  const callCountMap: Record<string, number> = {};
  for (const c of monthCalls ?? []) {
    const id = (c as { agent_id: string }).agent_id;
    callCountMap[id] = (callCountMap[id] ?? 0) + 1;
  }

  const { data: orgRow } = baseAgent.portal_email
    ? await supabase.from('organizations').select('owner_passphrase, billing_model, active_contract_id').eq('portal_email', baseAgent.portal_email).single()
    : { data: null };
  const hasPassphrase = !!orgRow?.owner_passphrase?.trim();

  // Anual: si la org está en contrato prepagado, no se puede autocontratar por Stripe.
  const billingModel = (orgRow?.billing_model as string | null) ?? 'stripe';
  const isAnnualOrExpired = billingModel === 'annual_prepaid' || billingModel === 'expired';

  // ─── Métricas agregadas del equipo (para bloque destacado tipo /inicio) ─────
  const activeAgentsCount = agents.filter(a =>
    (a.active as boolean) && !(a.client_paused as boolean) && (a.billing_status as string) !== 'pago_fallido'
  ).length;
  const totalCallsMonth = Object.values(callCountMap).reduce<number>((sum, c) => sum + (c as number), 0);
  const totalOpsMonth   = agents.reduce((sum, a) => sum + ((a.ai_ops_used as number) ?? 0), 0);
  const agentsWithRole  = agents.filter(a => !!((a.role as string | null)?.trim())).length;
  const rolePct         = agents.length > 0 ? Math.round((agentsWithRole / agents.length) * 100) : 0;

  // Empleados con email propio conectado (Gmail/Outlook a nivel agent).
  // Contamos agent_ids distintos con al menos una integración en email_integrations.
  const { data: emailRows } = agents.length > 0
    ? await supabase.from('email_integrations').select('agent_id').in('agent_id', agents.map(a => a.id))
    : { data: [] as { agent_id: string }[] };
  const agentsWithEmail = new Set((emailRows ?? []).map(r => r.agent_id)).size;
  const emailPct        = agents.length > 0 ? Math.round((agentsWithEmail / agents.length) * 100) : 0;
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

  // ─── Shared inner content ────────────────────────────────────────────────────
  // Agent cards grid + capability banner are rendered identically in V1 and V2.
  // Only the outer wrapper (header section + container) differs.

  const teamMetrics: Array<{ icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>; label: string; value: React.ReactNode; caption: string; color: string }> = [
    { icon: Users,      label: 'Empleados activos',    value: <>{activeAgentsCount} <span className="text-[13px] font-normal" style={{ color: '#9B8FB5' }}>/ {agents.length}</span></>, caption: agents.length === 1 ? 'del equipo' : 'del equipo',              color: '#6C3BFF' },
    { icon: PhoneCall,  label: 'Llamadas atendidas',   value: totalCallsMonth,                                                                                                       caption: 'en total del mes',                                                color: '#0EA5E9' },
    { icon: Zap,        label: 'Tareas ejecutadas',    value: totalOpsMonth,                                                                                                         caption: 'ops del mes',                                                     color: '#10B981' },
    { icon: Mail,       label: 'Con email integrado',  value: <>{emailPct}<span className="text-[16px] font-semibold" style={{ color: '#9B8FB5' }}>%</span></>,                      caption: `${agentsWithEmail} de ${agents.length}`,                           color: '#F59E0B' },
  ];

  const teamMetricsBlock = (
    <div className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Tu equipo este mes</h2>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>Actividad agregada de todos tus empleados en el mes actual.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ borderTop: '1px solid #F0EDF9' }}>
        {teamMetrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={m.label}
              className="flex flex-col gap-2.5 px-5 py-4"
              style={{
                borderRight: i < teamMetrics.length - 1 ? '1px solid #F0EDF9' : 'none',
                borderBottom: i < 2 ? '1px solid #F0EDF9' : 'none',
              }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${m.color}14`, border: `1px solid ${m.color}30` }}>
                  <Icon size={14} style={{ color: m.color }} strokeWidth={2.25} />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  {m.label}
                </p>
              </div>
              <p className="text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: '#1A0A3B' }}>
                {m.value}
              </p>
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>{m.caption}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  const agentCardsGrid = (
    <div id="lista-agentes" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map(a => {
        const color           = agentColor(a.id);
        const initial         = ((a.agent_name as string | null)?.trim() || (a.business_name as string)).charAt(0).toUpperCase();
        const isBillingPaused = !(a.active as boolean) && (a.billing_status as string) === 'pago_fallido';
        const isClientPaused  = !!(a.client_paused as boolean) && !isBillingPaused;
        const isOnline        = (a.active as boolean) && !isClientPaused && !isBillingPaused;
        const hasRole         = !!((a.role as string | null)?.trim());
        const meerkatId       = ((a.features as any)?.meerkat_role_id as string | null) || null;
        const meerkatDefEarly = meerkatId ? MEERKAT_MAP[meerkatId as MeerkatRoleId] ?? null : null;
        // Bug 2026-08-19: Nox/Nala aparecían morados porque roleColor caía al
        // default #6C3BFF cuando features.role_color era null. Ahora usa el
        // color canónico del MEERKAT_MAP cuando el agent tiene meerkat_role_id.
        const roleColor       = ((a.features as any)?.role_color as string | null)
                                || meerkatDefEarly?.color
                                || '#6C3BFF';
        // Fallback ladder: custom avatar del owner → imagen canónica del meerkat role → initial.
        // Bug 2026-08-19: Nox/Nala mostraban placeholder porque features.avatar era null y
        // el código no caía a role.imagen. Ver AC Proyectos.
        const avatarSrc       = ((a.features as any)?.avatar as string | null)
                                || meerkatDefEarly?.imagen
                                || null;
        const avatarLocked    = !!meerkatId;
        const isCoordinator   = !!meerkatId && (COORDINATOR_ROLE_IDS as readonly string[]).includes(meerkatId);
        const callCount       = callCountMap[a.id] ?? 0;

        const statusLabel = isBillingPaused ? 'Pago pendiente' : isClientPaused ? 'Pausado' : isOnline ? 'Activo' : 'Inactivo';
        const statusColor = isBillingPaused ? '#dc2626' : isClientPaused ? '#f59e0b' : isOnline ? '#16a34a' : '#6b7280';

        const jornadaType  = ((a as any).jornada_type as string) ?? 'combinada';
        const JORNADA_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
          combinada: { label: 'Combinada',    icon: <><Clock size={10} /><Zap size={10} /></>, color: '#6C3BFF', bg: 'rgba(108,59,255,0.08)', border: 'rgba(108,59,255,0.2)' },
          minutos:   { label: 'Solo minutos', icon: <Clock size={10} />,                       color: '#0E7490', bg: 'rgba(6,182,212,0.10)',  border: 'rgba(6,182,212,0.30)'  },
          tareas:    { label: 'Solo tareas',  icon: <Zap size={10} />,                         color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)'  },
        };
        const jornada = JORNADA_META[jornadaType] ?? JORNADA_META['combinada'];

        const meerkatDef    = meerkatId ? MEERKAT_MAP[meerkatId as MeerkatRoleId] ?? null : null;
        const agentFeatures = (a.features as Record<string, unknown>) ?? {};
        const tools         = getAgentTools(agentFeatures);
        const capabilities  = getAgentCapabilities(tools);

        const accentColor = hasRole ? roleColor : color;
        const MAX_CAP_CHIPS = 5;
        const visibleCaps   = capabilities.slice(0, MAX_CAP_CHIPS);
        const hiddenCapsN   = Math.max(0, capabilities.length - MAX_CAP_CHIPS);
        const agentName     = (a.agent_name as string | null)?.trim() || 'Centinelia';

        return (
          <div key={a.id}
            className="group flex flex-col rounded-2xl overflow-hidden transition-all hover:shadow-[0_8px_28px_rgba(26,10,59,0.08)] hover:-translate-y-0.5"
            style={{
              background: '#ffffff',
              border: '1px solid #E8E3F5',
              boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
            }}>

            {/* Hero: gradient wash + avatar centrado */}
            <div className="relative flex flex-col items-center px-5 pt-7 pb-5"
              style={{
                background: `linear-gradient(180deg, ${accentColor}14 0%, ${accentColor}04 60%, #ffffff 100%)`,
              }}>
              {/* Accent bar arriba (top-only) */}
              <div className="absolute top-0 left-0 right-0"
                style={{
                  height: 4,
                  background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`,
                }} />

              {/* Status pill flotante top-right */}
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                style={{
                  background: '#ffffff',
                  border: `1px solid ${statusColor}40`,
                  color: statusColor,
                  boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
                }}>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOnline ? 'animate-pulse' : ''}`}
                  style={{ background: 'currentColor' }} />
                {statusLabel}
              </span>

              {/* Avatar */}
              <div className="relative">
                <AgentAvatarPicker
                  token={a.portal_token as string}
                  avatarSrc={avatarSrc}
                  initial={initial}
                  color={accentColor}
                  size={104}
                  locked={avatarLocked}
                />
              </div>

              {/* Nombre + rol */}
              <div className="flex flex-col items-center gap-0.5 text-center w-full mt-3">
                <span className="font-bold text-[17px] leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
                  {agentName}
                </span>
                {hasRole && (
                  <span className="text-[13px] font-medium" style={{ color: accentColor }}>
                    {a.role as string}
                  </span>
                )}
              </div>

              {/* Jornada chip */}
              <span className="inline-flex items-center gap-1 mt-2.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: jornada.bg, border: `1px solid ${jornada.border}`, color: jornada.color }}>
                {jornada.icon}
                {jornada.label}
              </span>
            </div>

            {/* Descripción */}
            {meerkatDef?.descripcion && (
              <div className="px-5 pt-4 pb-3" style={{ borderTop: '1px solid #F0EDF9' }}>
                <p className="text-[12px] leading-relaxed text-center" style={{ color: '#6B6480' }}>
                  {meerkatDef.descripcion}
                </p>
              </div>
            )}

            {/* Stats: 2 columnas con divider */}
            <div className="grid grid-cols-2" style={{ borderTop: '1px solid #F0EDF9' }}>
              <div className="flex flex-col items-center gap-1 py-3.5"
                style={{ borderRight: '1px solid #F0EDF9', opacity: isCoordinator ? 0.4 : 1 }}>
                <div className="flex items-center gap-1.5">
                  <PhoneCall size={13} style={{ color: '#9B8FB5' }} strokeWidth={2.25} />
                  <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color: '#1A0A3B' }}>
                    {isCoordinator ? '—' : callCount}
                  </span>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  Llamadas
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 py-3.5">
                <div className="flex items-center gap-1.5">
                  <Zap size={13} style={{ color: '#9B8FB5' }} strokeWidth={2.25} />
                  <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color: '#1A0A3B' }}>
                    {(a.ai_ops_used as number) ?? 0}
                  </span>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  Tareas
                </p>
              </div>
            </div>

            {/* Capacidades — visibles siempre, overflow con +N (hover reveal) */}
            {capabilities.length > 0 && (
              <div className="px-5 py-3.5 flex flex-col gap-2" style={{ borderTop: '1px solid #F0EDF9' }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
                  Capacidades
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visibleCaps.map(c => (
                    <span key={c.label}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                      style={{
                        background: `${c.color}12`,
                        color:      c.color,
                        border:     `1px solid ${c.color}25`,
                      }}>
                      {c.label}
                    </span>
                  ))}
                  {hiddenCapsN > 0 && (
                    <span className="relative group/more">
                      <span
                        className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md cursor-default transition-colors group-hover/more:bg-[#F0EDF9] group-hover/more:border-[#9B8FB5]"
                        style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
                      >
                        +{hiddenCapsN} más
                      </span>
                      {/* Popover UP con las restantes al hover — evita clipping por
                          overflow-hidden del card y no compite con el footer */}
                      <span
                        className="absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/more:flex flex-wrap gap-1.5 rounded-xl p-2.5 w-[220px]"
                        style={{
                          background: '#ffffff',
                          border: '1px solid #E8E3F5',
                          boxShadow: '0 8px 24px rgba(26,10,59,0.15)',
                        }}
                      >
                        {capabilities.slice(MAX_CAP_CHIPS).map(c => (
                          <span key={c.label}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                            style={{
                              background: `${c.color}12`,
                              color:      c.color,
                              border:     `1px solid ${c.color}25`,
                            }}>
                            {c.label}
                          </span>
                        ))}
                      </span>
                    </span>
                  )}
                </div>
                {isCoordinator && !hasPassphrase && (
                  <p className="text-[10px] leading-relaxed mt-1" style={{ color: '#f59e0b' }}>
                    Sin passphrase del responsable, este director no puede actuar. Configúrala abajo.
                  </p>
                )}
              </div>
            )}

            {/* Acciones — footer */}
            <div className="flex items-center gap-2 px-4 py-3 mt-auto"
              style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
              <Link
                href={`/portal/${token}/configurar?empleado_id=${a.id as string}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90"
                style={{
                  background: accentColor,
                  color: '#ffffff',
                  boxShadow: `0 2px 6px ${accentColor}30`,
                }}
              >
                <Settings2 size={13} strokeWidth={2.25} />
                Configurar
              </Link>
              {!isBillingPaused
                ? <PauseResumeButton agentId={a.id} clientPaused={isClientPaused} />
                : (
                  <a
                    href={`/api/billing/portal-session?token=${a.portal_token as string}`}
                    className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-[13px] font-semibold transition-opacity hover:opacity-90 flex-shrink-0"
                    style={{ background: '#ef4444', color: '#ffffff', boxShadow: '0 2px 6px rgba(239,68,68,0.3)' }}>
                    Resolver pago
                  </a>
                )
              }
            </div>
          </div>
        );
      })}
    </div>
  );

  const capabilityBanner = agents.length > 0 ? (() => {
    const isComplete = overallPct === 100;
    const accentColor = isComplete ? '#16a34a' : '#6C3BFF';
    const accentBg    = isComplete ? 'rgba(34,197,94,0.06)' : 'rgba(108,59,255,0.05)';
    const accentBd    = isComplete ? '1px solid rgba(34,197,94,0.22)' : '1px solid rgba(108,59,255,0.22)';

    return (
    <div className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: '#ffffff', border: accentBd, boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>

      {/* Hero header — badge lila + título + gauge */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-4 flex-wrap"
        style={{ background: accentBg, borderBottom: accentBd }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}33` }}>
          <Layers size={20} style={{ color: accentColor }} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>Cobertura funcional</h2>
          {overallPct < 100 && missingCats.length > 0 && (
            <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B6480' }}>
              Sin cubrir:{' '}
              <span style={{ color: '#1A0A3B' }}>
                {missingCats.length <= 3
                  ? missingCats.map(c => c.label).join(', ')
                  : `${missingCats.slice(0, 3).map(c => c.label).join(', ')} y ${missingCats.length - 3} más`}
              </span>
            </p>
          )}
          {isComplete && (
            <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
              Tu equipo cubre todas las áreas funcionales.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[15px] font-bold px-3 py-1 rounded-lg tabular-nums"
            style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}30` }}>
            {overallPct}%
          </span>
          <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: '#E8E3F5' }}>
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${overallPct}%`, background: accentColor }} />
          </div>
        </div>
      </div>

      {/* Core categories */}
      <div className="px-5 py-4">
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
          Áreas principales
        </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-0">
        {coreStats.map(cat => (
          <details key={cat.label}>
            <summary
              className="cursor-pointer list-none select-none flex items-center gap-1.5 py-1.5 px-1 rounded-lg transition-colors"
              style={{ WebkitAppearance: 'none' } as React.CSSProperties}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
              <span className="text-[11px] font-medium flex-1 truncate" style={{ color: '#1A0A3B' }}>
                {cat.label}
              </span>
              {/* Móvil: solo fracción X/Y (sin barra) */}
              <span className="sm:hidden text-[11px] font-semibold tabular-nums flex-shrink-0"
                style={{ color: cat.covered === cat.total ? '#16a34a' : '#9B8FB5' }}>
                {cat.covered}/{cat.total}
              </span>
              {/* Desktop: barra + % */}
              <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: '#E8E3F5' }}>
                  <div className="h-1 rounded-full" style={{ width: `${Math.round((cat.covered / cat.total) * 100)}%`, background: cat.covered === cat.total ? '#16a34a' : cat.color }} />
                </div>
                <span className="text-[10px] tabular-nums w-6 text-right" style={{ color: '#9B8FB5' }}>
                  {Math.round((cat.covered / cat.total) * 100)}%
                </span>
              </div>
              <span className="text-[10px] flex-shrink-0" style={{ color: '#9B8FB5' }}>▸</span>
            </summary>
            <div className="ml-3 mt-0.5 mb-1.5 flex flex-col gap-0.5">
              {cat.tools.map(t => (
                <div key={t.key} className="flex items-center gap-1 py-0.5">
                  <span className="text-[10px] w-3 text-center flex-shrink-0"
                    style={{ color: t.covered ? '#16a34a' : '#9B8FB5' }}>
                    {t.covered ? '✓' : '○'}
                  </span>
                  <span className="group/cap relative text-[10px] leading-tight cursor-default"
                    style={{ color: t.covered ? '#1A0A3B' : '#9B8FB5' }}>
                    {t.label}
                    {(t.covered ? t.agents.length > 0 : t.suggestedRoles.length > 0) && (
                      <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-50 hidden group-hover/cap:inline-block">
                        <span className="rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap shadow-md"
                          style={{
                            background: '#ffffff',
                            border:     `1px solid ${t.covered ? '#E8E3F5' : 'rgba(108,59,255,0.35)'}`,
                            color:      t.covered ? '#1A0A3B' : '#9B6DFF',
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

      {/* Módulos adicionales */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
          Módulos adicionales
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-0">
          {specializedStats.map(cat => (
            <details key={cat.label}>
              <summary
                className="cursor-pointer list-none select-none flex items-center gap-1.5 py-1.5 px-1 rounded-lg transition-colors"
                style={{ WebkitAppearance: 'none' } as React.CSSProperties}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-60" style={{ background: cat.color }} />
                <span className="text-[11px] font-medium flex-1 truncate" style={{ color: '#6B6480' }}>
                  {cat.label}
                </span>
                <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: '#9B8FB5' }}>
                  {cat.covered}/{cat.total}
                </span>
                <span className="text-[10px] flex-shrink-0" style={{ color: '#9B8FB5' }}>▸</span>
              </summary>
              <div className="ml-3 mt-0.5 mb-1.5 flex flex-col gap-0.5">
                {cat.tools.map(t => (
                  <div key={t.key} className="flex items-center gap-1 py-0.5">
                    <span className="text-[10px] w-3 text-center flex-shrink-0"
                      style={{ color: t.covered ? '#16a34a' : '#9B8FB5' }}>
                      {t.covered ? '✓' : '○'}
                    </span>
                    <span className="group/cap relative text-[10px] leading-tight cursor-default"
                      style={{ color: t.covered ? '#6B6480' : '#9B8FB5' }}>
                      {t.label}
                      {(t.covered ? t.agents.length > 0 : t.suggestedRoles.length > 0) && (
                        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-50 hidden group-hover/cap:inline-block">
                          <span className="rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap shadow-md"
                            style={{
                              background: '#ffffff',
                              border:     `1px solid ${t.covered ? '#E8E3F5' : 'rgba(108,59,255,0.35)'}`,
                              color:      t.covered ? '#1A0A3B' : '#9B6DFF',
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

      {/* CTA — contratar meerkats recomendados para cerrar los huecos */}
      {missingCats.length > 0 && !annualContractInfo && (
        <div className="flex items-center gap-3 flex-wrap px-5 py-4"
          style={{ background: '#FAFAFB', borderTop: '1px solid #F0EDF9' }}>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}30` }}>
              <Sparkles size={14} style={{ color: accentColor }} strokeWidth={2.25} />
            </div>
            <p className="text-[12px]" style={{ color: '#6B6480' }}>
              Contrata los empleados recomendados para cubrir las áreas que faltan.
            </p>
          </div>
          <MeerkatPicker
            token={token}
            plan={(baseAgent.plan ?? 'pro') as 'pro'}
            defaultTier={(baseAgent.minutes_plan ?? 'starter') as any}
            recommendations={meerkatRecs}
          />
        </div>
      )}
    </div>
    );
  })() : null;

  // Empleados con pago fallido — banner consolidado con reactivación granular
  const pausedByBilling = agents.filter(a =>
    !(a.active as boolean) && (a.billing_status as string) === 'pago_fallido'
  );

  const billingAlertBanner = pausedByBilling.length > 0 ? (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(239,68,68,0.08) 0%, #ffffff 100%)',
        border: '2px solid rgba(239,68,68,0.3)',
        boxShadow: '0 4px 20px rgba(239,68,68,0.08)',
      }}>
      <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ borderBottom: '1px solid #F0EDF9' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#ef4444', boxShadow: '0 4px 12px rgba(239,68,68,0.35)' }}>
          <AlertTriangle size={18} color="#fff" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold" style={{ color: '#dc2626' }}>
            {pausedByBilling.length} {pausedByBilling.length === 1 ? 'empleado pausado por falta de pago' : 'empleados pausados por falta de pago'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
            Cada empleado tiene su propia suscripción. Al resolver el pago de uno, solo ese se reactiva.
          </p>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-2">
        {pausedByBilling.map(a => {
          const name = ((a.agent_name as string | null)?.trim()) || 'Empleado';
          const role = ((a.role as string | null)?.trim()) || null;
          return (
            <a key={a.id as string}
              href={`/api/billing/portal-session?token=${a.portal_token as string}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all hover:translate-x-0.5"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: '#ef4444' }}>
                <AlertTriangle size={16} color="#fff" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{name}</p>
                {role && <p className="text-xs truncate" style={{ color: '#6B6480' }}>{role}</p>}
              </div>
              <span className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                style={{ background: '#ef4444', color: '#fff' }}>Resolver</span>
            </a>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <PageContainer>

      <PageSection
        heading={
          <SectionHeader
            as="h1"
            eyebrow="TU EQUIPO"
            title="Mis Empleados"
            description={`${agents.length} ${agents.length === 1 ? 'empleado' : 'empleados'} · ${baseAgent.business_name}`}
            right={
              !annualContractInfo ? (
                <MeerkatPicker
                  token={token}
                  plan={(baseAgent.plan ?? 'pro') as 'pro'}
                  defaultTier={(baseAgent.minutes_plan ?? 'starter') as any}
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

        {/* Empleados pausados por pago — banner destacado (urgencia) */}
        {billingAlertBanner}

        {/* Métricas del equipo — hero + stat cards */}
        {agents.length > 0 && teamMetricsBlock}

        {/* Empty state */}
        {agents.length === 0 && (
          <Card>
            <EmptyState
              icon={Meerkat as any}
              title="Sin empleados en tu cuenta"
              size="md"
            />
          </Card>
        )}

        {/* Agent cards */}
        {agents.length > 0 && agentCardsGrid}

        {/* Cobertura funcional */}
        {capabilityBanner}

        {/* Ranking del equipo */}
        <AgentRankingSection token={token} />

      </PageSection>

    </PageContainer>
  );
}
