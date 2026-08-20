# Capa 2 — Skills Packs Design

**Fecha:** 2026-08-19
**Contexto:** Refactor tool-bloat. Capa 1 (opt-in presets), Deudas #1/#2/#3 y Capa 3 (tool_overrides) ya shipped.
**Autor:** Nazre + Claude Opus 4.7 (sesión brainstorm)

## Problema

Hoy hay 3 formas de decidir qué tools recibe cada meerkat:

1. **Presets por rol** (`MEERKAT_VOICE_DISTRIBUTION`, `MEERKAT_EMAIL_DISTRIBUTION`): asignación por rol, hard-coded en TS.
2. **`registry.ts::gatedByFeature`**: string por tool que dice "solo si org tiene feature X". Sin UI, sin estructura formal, sin auto-detección.
3. **`voice_agents.tool_overrides` (Capa 3)**: JSONB per-meerkat que agrega/quita tools individuales al preset.

El gap es Capa 2: **gate a nivel org** para bundles de tools relacionadas (dominios completos como QuickBooks, Solución Factible, MercadoLibre). Hoy vive como strings sueltos en `gatedByFeature` sin agrupación semántica, sin UI, y con lógica de gating dispersa en el runtime.

**Caso concreto que motiva:** ML (analizar_publicaciones_ml + 3 más). Está declarado en presets Voice de Noah y Niva, gatedByFeature='mercadolibre'. Data 2026-08-19: **0 orgs activos**. Cero clientes lo usan pero el código sigue vivo. Al designer una Capa 2 formal, ML sería un pack inactivo (auto-detectado) que desaparece de todos los meerkats.

## Objetivos

1. Formalizar `gatedByFeature` como estructura de datos (`SkillPack`) con metadata (label, description, tools).
2. **Auto-activación** basada en fuentes existentes (integración conectada = pack activo). Cero drift entre estado de integración y disponibilidad de tools.
3. UI en la sección Integraciones del portal (portal-level, no oficina) — cada tarjeta de capability muestra el pack asociado + estado + tools que trae.
4. Runtime consistente en los 3 canales (voice, chat, email) — el filtro por packs aplica igual que presets/overrides.
5. Migración progresiva desde `gatedByFeature` (deprecar sin romper retrocompat).

## No-objetivos (YAGNI)

- **Persistir estado de packs:** derivamos de fuentes existentes (`qb_integrations`, `organizations.invoicing_provider`, etc.). No hay `organizations.enabled_packs` column porque implicaría sync con drift potencial.
- **Toggle manual de packs:** el owner activa un pack conectando la integración correspondiente (auto). No hay pantalla "instalar/desinstalar pack".
- **Cross-role assignment por pack:** si owner quiere que Nox use `qb_*` aunque su preset no las liste, usa Capa 3 (`tool_overrides.enabled`). Los packs no son un mecanismo alterno para eso.
- **Packs como upsell / billing:** no están ligados a pricing/plan. Todos los packs disponibles para todo cliente que conecte la integración correspondiente.
- **Wizard de onboarding por pack:** fuera de scope. Al conectar QB se activa el pack sin pasos adicionales.

## Diseño

### 1. Definición de pack (nuevo módulo)

Nuevo archivo `src/lib/tools/packs.ts`:

```typescript
export interface OrgPackContext {
  qb_realm_id?:         string | null;   // qb_integrations.realm_id
  invoicing_provider?:  string | null;   // organizations.invoicing_provider (solucion_factible, contpaqi)
  has_catalog?:         boolean;         // organizations.catalog_config != null
  has_ml?:              boolean;         // integration_accounts con provider='mercadolibre'
  has_outbound?:        boolean;         // organizations.outbound_daily_limit > 0
  has_civic?:           boolean;         // features.civic_reports === true en algún meerkat
  has_contracts?:       boolean;         // features.contract_drafts === true en algún meerkat
  has_sheets?:          boolean;         // sheets_mappings row existe
  has_hr?:              boolean;         // features.hr_enabled === true (o similar)
  has_field_dispatch?:  boolean;         // features.field_dispatch === true
  has_tramites?:        boolean;         // features.tramites_externos configurado
}

export interface SkillPack {
  id:           string;
  label:        string;
  description:  string;
  tools:        string[];                        // Los nombres de tool que este pack habilita
  source:       string;                          // qué fuente lo determina (para docs/UI)
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
    tools: ['create_civic_report', 'lookup_civic_report', 'update_civic_report'],
    source: 'features.civic_reports',
    activeCheck: ctx => !!ctx.has_civic,
  },
  {
    id: 'contratos', label: 'Contratos',
    description: 'Generar borradores de contrato',
    tools: ['create_contract_draft'],
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

// Índice inverso: tool → pack (o null si no pertenece a ningún pack)
export const TOOL_TO_PACK: Record<string, string> = Object.fromEntries(
  SKILL_PACKS.flatMap(p => p.tools.map(t => [t, p.id]))
);
```

### 2. Estado derivado

Helper `resolveOrgPackContext + resolveActivePacks` en el mismo módulo:

```typescript
export async function resolveOrgPackContext(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<OrgPackContext> {
  const [qb, org, sheets, ml] = await Promise.all([
    supabase.from('qb_integrations').select('realm_id').eq('portal_email', portalEmail).maybeSingle(),
    supabase.from('organizations').select('invoicing_provider, catalog_config, outbound_daily_limit').eq('portal_email', portalEmail).maybeSingle(),
    supabase.from('sheets_mappings').select('id').eq('portal_email', portalEmail).limit(1),
    supabase.from('integration_accounts').select('id').eq('portal_email', portalEmail).eq('provider', 'mercadolibre').limit(1),
  ]);

  // features.* que hoy viven en voice_agents (se toman del meerkat any, feature-flag org-wide)
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('portal_email', portalEmail);
  const anyFeature = (key: string) => (agents ?? []).some(a => (a.features as Record<string, unknown>)?.[key] === true);

  return {
    qb_realm_id:         qb.data?.realm_id,
    invoicing_provider:  org.data?.invoicing_provider,
    has_catalog:         !!org.data?.catalog_config,
    has_ml:              (ml.data?.length ?? 0) > 0,
    has_outbound:        (org.data?.outbound_daily_limit ?? 0) > 0,
    has_civic:           anyFeature('civic_reports'),
    has_contracts:       anyFeature('contract_drafts'),
    has_sheets:          (sheets.data?.length ?? 0) > 0,
    has_hr:              anyFeature('hr_enabled'),
    has_field_dispatch:  anyFeature('field_dispatch'),
    has_tramites:        anyFeature('tramites_externos'),
  };
}

export function resolveActivePacks(ctx: OrgPackContext): Set<string> {
  return new Set(SKILL_PACKS.filter(p => p.activeCheck(ctx)).map(p => p.id));
}

/**
 * Filtra un array de tool names por packs activos. Tools que NO pertenecen
 * a ningún pack pasan siempre. Tools de packs INACTIVOS se dropean.
 */
export function filterByActivePacks(tools: string[], activePacks: Set<string>): string[] {
  return tools.filter(t => {
    const pack = TOOL_TO_PACK[t];
    return !pack || activePacks.has(pack);
  });
}
```

Cache scope: por request. En inbox-processor / agent-chat / vapi/sync se llama una vez por procesamiento (mismo portalEmail → mismo contexto).

### 3. Runtime integration en los 3 canales

**Formula final** (aplica en cada canal):

```
tools = (preset ∪ universales)   ← lo que ya hace hoy
      ∩ toolsAllowedByActivePacks ← nuevo: filtro por packs
      − overrides.disabled       ← Capa 3
      + overrides.enabled        ← Capa 3 (respetando packs activos)
```

**inbox-processor.ts** (email):

```typescript
const ctx = await resolveOrgPackContext(portalEmail, supabase);
const activePacks = resolveActivePacks(ctx);

const presetTools = getToolsForRoleEmail(inboxMeerkatId, qbConnected);
const packFiltered = presetTools.filter(t => {
  const pack = TOOL_TO_PACK[t.name];
  return !pack || activePacks.has(pack);
});

const overrides = parseToolOverrides(agentRow?.tool_overrides);
// applyToolOverrides ya existe (Capa 3); solo hay que respetar packs en enabled
const finalTools = applyToolOverrides(packFiltered, overrides, name => {
  const pack = TOOL_TO_PACK[name];
  if (pack && !activePacks.has(pack)) return undefined; // enabled respeta packs
  return EMAIL_TOOL_BY_NAME[name];
});
```

**agent-chat/route.ts** (chat): mismo patrón, usa `CHAT_TOOL_BY_NAME`.

**vapi/sync.ts** (voice): mismo patrón, aplicado sobre el array `tools: ToolDef[]` con shape distinta (name vive en `tool.function.name`).

### 4. UI en IntegrationsHub

`src/app/portal/[token]/IntegrationsHub.tsx` — cada CapabilityRow se enriquece:

- **Badge "Pack activo"** cuando la integración correspondiente está conectada. Verde con texto "N tools habilitadas" (N = pack.tools.length).
- **Al hacer hover del badge**: tooltip lista las tools que el pack habilita: "Al conectar quedan disponibles: qb_crear_factura, qb_consultar_facturas, …"
- **Al iniciar desconexión**: modal preventivo "Se deshabilitarán N tools que actualmente usa X meerkats. Confirmar?" (query fetch: cuántos meerkats tienen alguna de esas tools en su preset activo).
- **Sin cambios** en el flujo de conectar/desconectar. Solo enriquece la card existente.

Nueva fuente de datos para la UI: endpoint `GET /api/portal/[token]/packs` que retorna `{ activePacks: string[], allPacks: SkillPack[], meerkatsUsingPack: Record<string, number> }`. Un roundtrip para poblar todas las badges.

No hay página nueva. No hay toggle explícito. Todo pasa por la sección Integraciones existente.

### 5. Migration path (de gatedByFeature a packs)

**Fase 1 (esta implementación):**

- Nuevo módulo `packs.ts` + runtime filter + UI badges.
- `registry.ts` mantiene `gatedByFeature` string por retrocompat.
- Agrega campo opcional `pack: string | null` a `ToolEntry` para que /admin/tools muestre la pertenencia.
- Runtime: el filtro nuevo (packs) es la fuente de verdad. `gatedByFeature` queda como metadata para docs pero no gate en runtime (el pack ya lo hace).
- **Verificación:** cada tool con `gatedByFeature != null` tiene equivalente en un pack. Si aparece drift, error de dev-time (test unitario).

**Fase 2 (futuro commit, cuando validado en prod ≥2 semanas):**

- Remove `gatedByFeature` de `ToolEntry`.
- Simplifica registry.ts.

Riesgo bajo: gatedByFeature hoy solo bloquea en `getToolsForRole` (chat) via `if (!qbConnected && chatName.startsWith('qb_'))` — hardcoded a QB únicamente. Los otros gatedByFeature (mercadolibre, civic_reports, contract_drafts) no tienen enforcement en runtime hoy más allá de estar en el preset. Los packs los harán reales.

### 6. Interacción con Capa 3 (overrides)

**Orden estricto de aplicación:**

1. Preset del meerkat (`MEERKAT_*_DISTRIBUTION[role]`)
2. Universales (base 6: delegar_tarea, consultar_agente, pedir_a_humano, reportar_falla, read_url, buscar_en_web)
3. **Filtro por packs activos** ← nuevo
4. `overrides.disabled` (quita)
5. `overrides.enabled` (agrega — respetando packs)

**Caveat crítico:** `overrides.enabled` NO puede saltarse el gate de pack. Si owner intenta habilitar `qb_crear_factura` para Nova pero QB no está conectado, la tool no aparece.

**UI feedback:** cuando (en futura UI de overrides Capa 3) el owner intente enable una tool cuyo pack está inactivo, el toggle se ve con warning "Requiere conectar QuickBooks primero" y no se guarda hasta activar el pack.

**Fórmula compacta final:**

```
result = ((preset ∪ universales) ∩ activePacks) − disabled + (enabled ∩ activePacks)
```

Donde `activePacks` incluye implícitamente todas las tools que no pertenecen a ningún pack.

## Tests

Unitarios en `src/lib/tools/packs.test.ts`:

- Cada pack en SKILL_PACKS tiene al menos 1 tool
- Ningún tool aparece en 2 packs (TOOL_TO_PACK unívoco)
- `filterByActivePacks(all_pack_tools, empty_set) → []`
- `filterByActivePacks(all_pack_tools, ['quickbooks']) → solo qb_*`
- `filterByActivePacks([tool_sin_pack], empty_set) → [tool_sin_pack]` (tools sin pack pasan siempre)

Integración: modificar `MEERKAT_EMAIL_DISTRIBUTION` test para verificar que con pack `mercado_libre` inactivo, Niva (que tiene ML en preset voice pero email no) sigue igual; Noah con pack activo sí recibe ml_* en su próximo canal futuro (cuando se agreguen a preset email).

## Preguntas abiertas

- ¿`features.civic_reports` / `features.contract_drafts` / etc. siguen viviendo en voice_agents.features (per-meerkat) o migran a organizations.features (org-level) tras Capa 2? Decidir junto con Deuda "logo_url por agente" del handoff. Fuera de scope de este spec.
- El campo `pack` en registry.ts se agrega en Fase 1 sin gate. Si un tool aparece en ningún pack pero `gatedByFeature` sí (raro), debería fallar el test unitario. Verificar auditoría antes de shippear.

## Referencias

- Handoff tool-bloat refactor (ver [[handoff-tool-bloat-refactor]])
- Capa 1 shipped: commit 2026-08-18 (opt-in presets)
- Capa 3 backend shipped: commit `55eb5193` (voice_agents.tool_overrides)
- ML hidden 2026-08-19 (mismo día): commits pending — caso de estudio del pack `mercado_libre`
- Registry actual: `src/lib/tools/registry.ts` (gatedByFeature strings)
- Channel-mapping: `src/lib/tools/channel-mapping.ts` (UNIVERSAL_TOOLS, VOICE_TO_CHAT)
- Feedback duras: [[feedback-tool-bloat-reglas]] (5 reglas), [[feedback-tool-distribution-intentional]]
