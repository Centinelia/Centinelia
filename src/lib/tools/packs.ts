import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Capa 2 tool-bloat: skills packs.
 *
 * Un pack agrupa tools relacionadas por dominio (quickbooks, invoicing_cfdi,
 * etc.). Se activa automáticamente cuando el org tiene la fuente correspondiente
 * conectada (qb_integrations row existe, organizations.invoicing_provider seteado,
 * integration_accounts con provider='mercadolibre', etc.).
 *
 * Runtime en los 3 canales aplica filterByActivePacks después del preset del rol
 * y antes de los tool_overrides Capa 3.
 *
 * Ver spec: docs/superpowers/specs/2026-08-19-capa-2-skills-packs-design.md
 */

export interface OrgPackContext {
  qb_realm_id?:         string | null;
  invoicing_provider?:  string | null;
  has_catalog?:         boolean;
  has_ml?:              boolean;
  has_outbound?:        boolean;
  has_civic?:           boolean;
  has_contracts?:       boolean;
  has_sheets?:          boolean;
  has_hr?:              boolean;
  has_field_dispatch?:  boolean;
  has_tramites?:        boolean;
}

export interface SkillPack {
  id:           string;
  label:        string;
  description:  string;
  tools:        string[];
  source:       string;
  activeCheck:  (ctx: OrgPackContext) => boolean;
}

export const SKILL_PACKS: SkillPack[] = [
  {
    id: 'quickbooks', label: 'QuickBooks',
    description: 'Facturación, cobros, órdenes de compra y reportes en QB',
    tools: [
      'qb_consultar_facturas', 'qb_buscar_cliente', 'qb_crear_factura',
      'qb_registrar_pago', 'qb_reporte_ingresos',
      'qb_crear_orden_compra', 'qb_consultar_orden_compra', 'qb_descargar_oc_pdf',
      'qb_crear_orden_compra_desde_cotizacion', 'qb_crear_cotizacion',
      'qb_registrar_gasto', 'qb_registrar_caja_chica',
    ],
    source: 'qb_integrations.realm_id',
    activeCheck: ctx => !!ctx.qb_realm_id,
  },
  {
    id: 'invoicing_cfdi', label: 'Facturación CFDI',
    description: 'Emitir, consultar y cancelar CFDIs vía PAC (SF, CONTPAQi)',
    tools: [
      'solicitar_factura', 'consultar_factura', 'solicitar_cancelacion_factura',
      'sf_timbrar_desde_oc', 'sf_cancelar_cfdi', 'sf_consultar_estado_sat',
      'firmar_oc', 'enviar_oc_a_pagos', 'registrar_comprobante_pago',
      'enviar_oc_a_proveedor', 'archivar_expediente',
    ],
    source: 'organizations.invoicing_provider',
    activeCheck: ctx => !!ctx.invoicing_provider,
  },
  {
    id: 'mercado_libre', label: 'MercadoLibre',
    description: 'Publicaciones, ventas y métricas en MercadoLibre',
    tools: ['analizar_publicaciones_ml', 'crear_publicacion_ml', 'actualizar_publicacion_ml', 'ver_metricas_ml'],
    source: 'integration_accounts (provider=mercadolibre)',
    activeCheck: ctx => !!ctx.has_ml,
  },
  {
    id: 'outbound_calls', label: 'Llamadas salientes',
    description: 'Iniciar llamadas outbound + gestión de lista NO-LLAMAR',
    tools: ['trigger_outbound_call', 'llamar_a', 'marcar_no_llamar'],
    source: 'organizations.outbound_daily_limit',
    activeCheck: ctx => !!ctx.has_outbound,
  },
  {
    id: 'civic_reports', label: 'Reportes cívicos',
    description: 'Registrar y consultar reportes ciudadanos municipales',
    tools: ['crear_reporte_civico', 'consultar_reporte_civico', 'actualizar_reporte_civico'],
    source: 'features.civic_reports',
    activeCheck: ctx => !!ctx.has_civic,
  },
  {
    id: 'contratos', label: 'Contratos',
    description: 'Generar borradores de contrato',
    tools: ['crear_borrador_contrato'],
    source: 'features.contract_drafts',
    activeCheck: ctx => !!ctx.has_contracts,
  },
  {
    id: 'google_sheets', label: 'Google Sheets',
    description: 'Leer y escribir en hojas de cálculo del negocio',
    tools: ['sheets_agregar_fila', 'sheets_actualizar_fila', 'sheets_leer', 'sheets_buscar'],
    source: 'sheets_mappings',
    activeCheck: ctx => !!ctx.has_sheets,
  },
  {
    id: 'cloud_catalog', label: 'Catálogo en la nube',
    description: 'Lookup de códigos/productos en Excel/CSV del negocio',
    tools: ['catalogo_buscar_codigo'],
    source: 'organizations.catalog_config',
    activeCheck: ctx => !!ctx.has_catalog,
  },
  {
    id: 'hr', label: 'RRHH',
    description: 'Faltas, vacaciones, permisos e incidencias del equipo',
    tools: ['registrar_falta', 'consultar_vacaciones', 'solicitar_permiso', 'verificar_incidencia'],
    source: 'features.hr_enabled',
    activeCheck: ctx => !!ctx.has_hr,
  },
  {
    id: 'campo_dispatch', label: 'Despacho de campo',
    description: 'Asignar unidades y consultar disponibilidad de campo',
    tools: ['asignar_unidad_campo', 'consultar_unidades_disponibles'],
    source: 'features.field_dispatch',
    activeCheck: ctx => !!ctx.has_field_dispatch,
  },
  {
    id: 'tramites_gobierno', label: 'Trámites gobierno',
    description: 'Catálogos, padrones y envío de trámites a sistemas externos',
    tools: ['consultar_catalogo_externo', 'buscar_en_padron_externo', 'enviar_tramite_externo'],
    source: 'features.tramites_externos',
    activeCheck: ctx => !!ctx.has_tramites,
  },
];

/**
 * Índice inverso: tool name → pack id (o undefined si no pertenece a ningún pack).
 * Tools que no aparecen aquí siempre pasan el filtro (no están gatadas por pack).
 * Tipo `Partial<Record>` refleja que el lookup puede retornar undefined.
 */
export const TOOL_TO_PACK: Partial<Record<string, string>> = Object.fromEntries(
  SKILL_PACKS.flatMap(p => p.tools.map(t => [t, p.id])),
);

export function resolveActivePacks(ctx: OrgPackContext): Set<string> {
  return new Set(SKILL_PACKS.filter(p => p.activeCheck(ctx)).map(p => p.id));
}

/**
 * Filtra un array de tool names por packs activos. Tools que NO pertenecen
 * a ningún pack pasan siempre. Tools de packs INACTIVOS se dropean.
 */
export function filterByActivePacks(toolNames: string[], activePacks: Set<string>): string[] {
  return toolNames.filter(name => {
    const packId = TOOL_TO_PACK[name];
    return !packId || activePacks.has(packId);
  });
}

/**
 * Resuelve OrgPackContext desde las fuentes existentes del org.
 * 1 lectura por request (cacheable en scope de request si se necesita).
 *
 * Nota: features.* per-meerkat (civic_reports, contract_drafts, hr_enabled,
 * field_dispatch, tramites_externos) se consideran org-active si CUALQUIER
 * meerkat del org las tiene = true. Esta lógica podría migrar a
 * organizations.features en el futuro (ver Preguntas Abiertas del spec).
 */
export async function resolveOrgPackContext(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<OrgPackContext> {
  const [qb, org, sheets, ml, agents] = await Promise.all([
    supabase.from('qb_integrations').select('realm_id').eq('portal_email', portalEmail).maybeSingle(),
    supabase.from('organizations').select('invoicing_provider, catalog_config, outbound_daily_limit').eq('portal_email', portalEmail).maybeSingle(),
    supabase.from('sheets_mappings').select('id').eq('portal_email', portalEmail).limit(1),
    supabase.from('integration_accounts').select('id').eq('portal_email', portalEmail).eq('provider', 'mercadolibre').limit(1),
    supabase.from('voice_agents').select('features').eq('portal_email', portalEmail),
  ]);

  // Log Supabase errors (fail-open — pack quedará inactivo si query falla, es la dirección segura).
  for (const [name, res] of [['qb_integrations', qb], ['organizations', org], ['sheets_mappings', sheets], ['integration_accounts.ml', ml], ['voice_agents', agents]] as const) {
    if (res.error) console.error(`[resolveOrgPackContext] ${name} query failed for ${portalEmail}:`, res.error.message);
  }

  const agentRows = (agents.data ?? []) as Array<{ features: unknown }>;
  const anyFeature = (key: string) =>
    agentRows.some(a => (a.features as Record<string, unknown> | null)?.[key] === true);

  return {
    qb_realm_id:         (qb.data?.realm_id as string | null | undefined) ?? null,
    invoicing_provider:  (org.data?.invoicing_provider as string | null | undefined) ?? null,
    has_catalog:         !!org.data?.catalog_config,
    has_ml:              ((ml.data ?? []).length) > 0,
    has_outbound:        ((org.data?.outbound_daily_limit as number | null | undefined) ?? 0) > 0,
    has_civic:           anyFeature('civic_reports'),
    has_contracts:       anyFeature('contract_drafts'),
    has_sheets:          ((sheets.data ?? []).length) > 0,
    has_hr:              anyFeature('hr_enabled'),
    has_field_dispatch:  anyFeature('field_dispatch'),
    has_tramites:        anyFeature('tramites_externos'),
  };
}
