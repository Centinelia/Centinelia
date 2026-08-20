# Capa 2 Skills Packs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalizar `gatedByFeature` como estructura `SkillPack[]` con auto-detección basada en integraciones existentes; aplicar filtro por packs activos en los 3 canales (voice, chat, email); enriquecer UI de Integraciones con badges de packs.

**Architecture:** Nuevo módulo puro `src/lib/tools/packs.ts` con 11 packs declarativos + helpers puros (`resolveActivePacks`, `filterByActivePacks`) + `resolveOrgPackContext` (async, lee fuentes existentes). Runtime en 3 canales inserta el filtro después del preset y antes de los tool_overrides Capa 3. Endpoint `GET /api/portal/[token]/packs` sirve estado + metadata para UI. IntegrationsHub.tsx agrega badges a las cards existentes.

**Tech Stack:** TypeScript, Next.js 15 (app router), Supabase Postgres, Anthropic SDK tool types, Vapi ToolDef, React server + client components.

**Spec:** `docs/superpowers/specs/2026-08-19-capa-2-skills-packs-design.md`

## Global Constraints

- Estado de packs es **derivado, no persistido** — sin migraciones DB en esta implementación.
- Tools no pertenecen a más de un pack (`TOOL_TO_PACK` unívoco — enforce con test unitario).
- Orden estricto de aplicación runtime: `(preset ∪ universales) ∩ activePacks − disabled + enabled`.
- `overrides.enabled` (Capa 3) NO puede saltarse el gate de pack — si el tool está en pack inactivo, no se agrega aunque esté en enabled.
- Runtime debe hacer solo 1 fetch de `OrgPackContext` por request (mismo portalEmail).
- Cambios en TypeScript deben pasar `npx tsc --noEmit` en cada commit.
- Idioma: nombres de tools ya son español (Deuda #2 shipped); packs también (`quickbooks` es id técnico pero label es "QuickBooks").
- Sin cambios a schemas de DB. Sin agregar columna `enabled_packs`.
- Presets existentes (`MEERKAT_VOICE_DISTRIBUTION`, `MEERKAT_EMAIL_DISTRIBUTION`) NO se modifican — packs son filtro adicional sobre lo que preset ya dio.
- Cada task ends with typecheck limpio + commit.

## File Structure

**Nuevos archivos:**
- `src/lib/tools/packs.ts` — definición de `SkillPack`, `SKILL_PACKS[]`, `TOOL_TO_PACK`, `resolveOrgPackContext`, `resolveActivePacks`, `filterByActivePacks`.
- `src/lib/tools/__tests__/packs.test.ts` — tests unitarios de las funciones puras + invariantes.
- `src/app/api/portal/[token]/packs/route.ts` — endpoint GET que retorna `{ activePacks, allPacks, meerkatsUsingPack }`.

**Archivos modificados:**
- `src/lib/ops/inbox-processor.ts` — insertar filtro por packs en `processInboxEmail` después de `getToolsForRoleEmail`, antes de `applyToolOverrides`.
- `src/app/api/portal/[token]/agent-chat/route.ts` — mismo patrón después de `getToolsForRole`, antes de aplicar `tool_overrides`.
- `src/lib/vapi/sync.ts` — insertar filtro inline sobre `tools: ToolDef[]` (shape distinta: `tool.function.name`) después de todas las adiciones condicionales y antes de aplicar overrides.
- `src/app/portal/[token]/IntegrationsHub.tsx` — agregar fetch a `/api/portal/[token]/packs` + badges + tooltips en cada CapabilityRow.
- `src/lib/tools/registry.ts` — agregar campo opcional `pack: string | null` a cada `ToolEntry` (metadata para /admin/tools, no gate runtime).

**Sin cambios a otros archivos.** channel-mapping.ts, tool-overrides.ts, schemas.ts quedan como están.

---

### Task 1: Módulo puro `packs.ts` + tests

**Files:**
- Create: `src/lib/tools/packs.ts`
- Test: `src/lib/tools/__tests__/packs.test.ts`

**Interfaces:**
- Consumes: nada externo (módulo raíz).
- Produces:
  - `interface OrgPackContext { qb_realm_id?, invoicing_provider?, has_catalog?, has_ml?, has_outbound?, has_civic?, has_contracts?, has_sheets?, has_hr?, has_field_dispatch?, has_tramites? }`
  - `interface SkillPack { id: string; label: string; description: string; tools: string[]; source: string; activeCheck: (ctx: OrgPackContext) => boolean }`
  - `const SKILL_PACKS: SkillPack[]` (11 packs)
  - `const TOOL_TO_PACK: Record<string, string>` (índice inverso)
  - `function resolveActivePacks(ctx: OrgPackContext): Set<string>`
  - `function filterByActivePacks(toolNames: string[], activePacks: Set<string>): string[]`
  - `async function resolveOrgPackContext(portalEmail: string, supabase): Promise<OrgPackContext>`

- [ ] **Step 1: Escribir tests que fallan**

```typescript
// src/lib/tools/__tests__/packs.test.ts
import { describe, expect, it } from 'vitest';
import {
  SKILL_PACKS,
  TOOL_TO_PACK,
  resolveActivePacks,
  filterByActivePacks,
  type OrgPackContext,
} from '../packs';

describe('SKILL_PACKS', () => {
  it('every pack has at least 1 tool', () => {
    for (const p of SKILL_PACKS) {
      expect(p.tools.length).toBeGreaterThan(0);
    }
  });

  it('every pack has unique id', () => {
    const ids = SKILL_PACKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no tool appears in 2 packs (TOOL_TO_PACK univocal)', () => {
    const seen = new Map<string, string>();
    for (const p of SKILL_PACKS) {
      for (const t of p.tools) {
        const previous = seen.get(t);
        if (previous) throw new Error(`Tool "${t}" in packs "${previous}" and "${p.id}"`);
        seen.set(t, p.id);
      }
    }
  });
});

describe('resolveActivePacks', () => {
  it('empty context returns empty set', () => {
    const active = resolveActivePacks({});
    expect(active.size).toBe(0);
  });

  it('qb_realm_id activates quickbooks pack', () => {
    const active = resolveActivePacks({ qb_realm_id: 'realm-123' });
    expect(active.has('quickbooks')).toBe(true);
    expect(active.has('mercado_libre')).toBe(false);
  });

  it('invoicing_provider activates invoicing_cfdi', () => {
    const active = resolveActivePacks({ invoicing_provider: 'solucion_factible' });
    expect(active.has('invoicing_cfdi')).toBe(true);
  });

  it('multiple flags activate multiple packs', () => {
    const active = resolveActivePacks({ qb_realm_id: 'r', has_ml: true, has_outbound: true });
    expect(active.has('quickbooks')).toBe(true);
    expect(active.has('mercado_libre')).toBe(true);
    expect(active.has('outbound_calls')).toBe(true);
  });
});

describe('filterByActivePacks', () => {
  it('tool without pack always passes', () => {
    // pedir_a_humano no está en ningún pack
    const filtered = filterByActivePacks(['pedir_a_humano'], new Set());
    expect(filtered).toEqual(['pedir_a_humano']);
  });

  it('tool in inactive pack is dropped', () => {
    const filtered = filterByActivePacks(['qb_crear_factura'], new Set());
    expect(filtered).toEqual([]);
  });

  it('tool in active pack passes', () => {
    const filtered = filterByActivePacks(['qb_crear_factura'], new Set(['quickbooks']));
    expect(filtered).toEqual(['qb_crear_factura']);
  });

  it('mixed set filters correctly', () => {
    const filtered = filterByActivePacks(
      ['qb_crear_factura', 'pedir_a_humano', 'analizar_publicaciones_ml'],
      new Set(['quickbooks']),
    );
    expect(filtered).toEqual(['qb_crear_factura', 'pedir_a_humano']);
  });
});
```

- [ ] **Step 2: Verificar que los tests fallan**

Run: `npx vitest run src/lib/tools/__tests__/packs.test.ts`
Expected: FAIL con "Cannot find module '../packs'"

- [ ] **Step 3: Implementar packs.ts**

```typescript
// src/lib/tools/packs.ts
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

/**
 * Índice inverso: tool name → pack id (o undefined si no pertenece a ningún pack).
 * Tools que no aparecen aquí siempre pasan el filtro (no están gatadas por pack).
 */
export const TOOL_TO_PACK: Record<string, string> = Object.fromEntries(
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
```

- [ ] **Step 4: Verificar que los tests pasan**

Run: `npx vitest run src/lib/tools/__tests__/packs.test.ts`
Expected: PASS (todos los tests)

- [ ] **Step 5: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/packs.ts src/lib/tools/__tests__/packs.test.ts
git commit -m "feat(tools): Capa 2 Task 1 — módulo packs.ts + tests

Módulo puro que define los 11 skills packs + helpers para resolver
estado activo desde fuentes existentes. Sin runtime integration todavía.

- SKILL_PACKS[]: quickbooks, invoicing_cfdi, mercado_libre, outbound_calls,
  civic_reports, contratos, google_sheets, cloud_catalog, hr,
  campo_dispatch, tramites_gobierno.
- TOOL_TO_PACK índice inverso (unívoco, verificado por test).
- resolveActivePacks (pure) + resolveOrgPackContext (async, 5 queries paralelas).
- filterByActivePacks: tools sin pack pasan siempre.

Ver spec: docs/superpowers/specs/2026-08-19-capa-2-skills-packs-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Endpoint `GET /api/portal/[token]/packs`

**Files:**
- Create: `src/app/api/portal/[token]/packs/route.ts`

**Interfaces:**
- Consumes: `SKILL_PACKS`, `resolveOrgPackContext`, `resolveActivePacks` from Task 1.
- Produces:
  - `GET /api/portal/[token]/packs` → JSON `{ activePacks: string[], allPacks: SkillPack[], meerkatsUsingPack: Record<string, number> }`
  - `activePacks`: ids de packs activos hoy en el org
  - `allPacks`: metadata de los 11 packs (para renderear cards, sin `activeCheck` que no es serializable)
  - `meerkatsUsingPack`: `{ packId: count }` — cuántos meerkats del org tienen al menos una tool de ese pack en su preset de rol (info para modal preventivo al desconectar)

- [ ] **Step 1: Crear endpoint**

```typescript
// src/app/api/portal/[token]/packs/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { SKILL_PACKS, resolveOrgPackContext, resolveActivePacks, TOOL_TO_PACK } from '@/lib/tools/packs';
import { MEERKAT_VOICE_DISTRIBUTION } from '@/lib/vapi/sync';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && resolved.portalEmail !== session.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const ctx = await resolveOrgPackContext(resolved.portalEmail, supabase);
  const activePacks = Array.from(resolveActivePacks(ctx));

  // Cuántos meerkats del org tienen al menos una tool de cada pack en su preset voice
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true);

  const meerkatsUsingPack: Record<string, number> = {};
  for (const p of SKILL_PACKS) meerkatsUsingPack[p.id] = 0;

  for (const a of (agents ?? [])) {
    const roleId = (a.features as Record<string, unknown> | null)?.meerkat_role_id as string | undefined;
    if (!roleId) continue;
    const preset = MEERKAT_VOICE_DISTRIBUTION[roleId] ?? [];
    const packsForThisMeerkat = new Set<string>();
    for (const tool of preset) {
      const packId = TOOL_TO_PACK[tool];
      if (packId) packsForThisMeerkat.add(packId);
    }
    for (const packId of packsForThisMeerkat) {
      meerkatsUsingPack[packId] = (meerkatsUsingPack[packId] ?? 0) + 1;
    }
  }

  // No serializar activeCheck (no es JSON-safe)
  const allPacks = SKILL_PACKS.map(({ activeCheck: _, ...rest }) => rest);

  return NextResponse.json({ activePacks, allPacks, meerkatsUsingPack });
}
```

- [ ] **Step 2: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Sanity test manual (curl con cookie)**

Con sesión de owner en Pneuma, curl al endpoint:
```bash
curl https://www.centinelia.mx/api/portal/{token}/packs -H "Cookie: ..." | jq
```
Expected: JSON con `activePacks` (probablemente `["outbound_calls"]` en Pneuma sin QB/SF), `allPacks` con 11 entries, `meerkatsUsingPack` con conteos.

Skip si no hay sesión disponible — el typecheck + shape del endpoint basta para pasar a Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/\[token\]/packs/route.ts
git commit -m "feat(tools): Capa 2 Task 2 — endpoint GET /packs

Sirve metadata + estado activo de packs al frontend (IntegrationsHub).
IDOR guard vía resolveOrgFromToken. Retorna:
- activePacks: ids de packs activos hoy en el org
- allPacks: metadata de los 11 (sin activeCheck que no es JSON-safe)
- meerkatsUsingPack: cuántos meerkats del org usan cada pack (para
  modal preventivo al desconectar integración)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Runtime email (inbox-processor.ts)

**Files:**
- Modify: `src/lib/ops/inbox-processor.ts:1304-1315` (bloque donde se construye `const tools`)

**Interfaces:**
- Consumes: `resolveOrgPackContext`, `resolveActivePacks`, `TOOL_TO_PACK` de Task 1.
- Produces: `getToolsForRoleEmail` no cambia signature. El filtro se aplica en el caller (`processInboxEmail`).

- [ ] **Step 1: Agregar imports**

Al top del archivo, después del import existente de `parseToolOverrides`:

```typescript
import { parseToolOverrides, applyToolOverrides } from '@/lib/tools/tool-overrides';
import { resolveOrgPackContext, resolveActivePacks, TOOL_TO_PACK } from '@/lib/tools/packs';
```

- [ ] **Step 2: Modificar bloque de construcción de tools**

Localizar en `processInboxEmail` el bloque actual:
```typescript
const qbConnected = !!(await getQBClient(portalEmail, supabase));
const inboxMeerkatId = ((agentRow?.features as { meerkat_role_id?: string } | undefined) ?? {}).meerkat_role_id ?? null;

const presetTools = getToolsForRoleEmail(inboxMeerkatId, qbConnected);

const overrides = parseToolOverrides((agentRow as { tool_overrides?: unknown } | null)?.tool_overrides);
const tools = applyToolOverrides(presetTools, overrides, name => EMAIL_TOOL_BY_NAME[name]);
```

Reemplazar por:
```typescript
const qbConnected = !!(await getQBClient(portalEmail, supabase));
const inboxMeerkatId = ((agentRow?.features as { meerkat_role_id?: string } | undefined) ?? {}).meerkat_role_id ?? null;

const presetTools = getToolsForRoleEmail(inboxMeerkatId, qbConnected);

// Capa 2 tool-bloat: filtrar por packs activos del org (después del preset,
// antes de los overrides). Tools que no pertenecen a ningún pack pasan siempre.
const packCtx     = await resolveOrgPackContext(portalEmail, supabase);
const activePacks = resolveActivePacks(packCtx);
const packFiltered = presetTools.filter(t => {
  const packId = TOOL_TO_PACK[t.name];
  return !packId || activePacks.has(packId);
});

// Capa 3 overrides: enabled respeta gate de pack (no puede agregar tool de pack inactivo).
const overrides = parseToolOverrides((agentRow as { tool_overrides?: unknown } | null)?.tool_overrides);
const tools = applyToolOverrides(packFiltered, overrides, name => {
  const packId = TOOL_TO_PACK[name];
  if (packId && !activePacks.has(packId)) return undefined;
  return EMAIL_TOOL_BY_NAME[name];
});
```

- [ ] **Step 3: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Verificar comportamiento con SQL sanity**

Confirmar que Pneuma (sin QB, sin SF, sin ML) NO recibiría qb_*/sf_*/ml_* en email. Query:
```sql
SELECT
  (SELECT COUNT(*) FROM qb_integrations WHERE portal_email='studio@pneumastudio.mx') as qb,
  (SELECT invoicing_provider FROM organizations WHERE portal_email='studio@pneumastudio.mx') as sf,
  (SELECT COUNT(*) FROM integration_accounts WHERE portal_email='studio@pneumastudio.mx' AND provider='mercadolibre') as ml;
```
Expected: qb=0, sf=null, ml=0 → packs quickbooks/invoicing_cfdi/mercado_libre INACTIVOS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops/inbox-processor.ts
git commit -m "feat(tools): Capa 2 Task 3 — runtime email aplica filtro por packs

processInboxEmail ahora resuelve OrgPackContext + filtra presetTools por
packs activos antes de aplicar overrides. Tools que no están en ningún
pack (universales, tools genéricas) pasan siempre.

Capa 3 overrides: enabled respeta gate de pack. Si owner intenta
enable qb_crear_factura sin QB conectado, la tool no aparece.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Runtime chat (agent-chat/route.ts)

**Files:**
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts` (imports + bloque de construcción de `sessionTools` + aplicación de overrides)

**Interfaces:**
- Consumes: helpers de Task 1.
- Produces: sessionTools filtrado por packs, después presets/universales/adiciones, antes de overrides.

- [ ] **Step 1: Agregar imports**

Después del import existente de `parseToolOverrides`:
```typescript
import { parseToolOverrides, applyToolOverrides } from '@/lib/tools/tool-overrides';
import { resolveOrgPackContext, resolveActivePacks, TOOL_TO_PACK } from '@/lib/tools/packs';
```

- [ ] **Step 2: Modificar el bloque de overrides existente**

Localizar el bloque actual (después de las adiciones condicionales de tools, antes de `toolsListText`):
```typescript
// Capa 3 tool-bloat: overrides finos por meerkat (post preset + additions)
const overrides = parseToolOverrides((agent as { tool_overrides?: unknown }).tool_overrides);
const finalTools = applyToolOverrides(sessionTools, overrides, name => CHAT_TOOL_BY_NAME[name]);
sessionTools.length = 0;
sessionTools.push(...finalTools);
```

Reemplazar por:
```typescript
// Capa 2 tool-bloat: filtrar por packs activos (después de preset + adiciones)
const packCtx     = await resolveOrgPackContext(accountAgent.portal_email!, supabase);
const activePacks = resolveActivePacks(packCtx);
const packFiltered = sessionTools.filter(t => {
  const packId = TOOL_TO_PACK[t.name];
  return !packId || activePacks.has(packId);
});

// Capa 3 tool-bloat: overrides finos por meerkat. enabled respeta gate de pack.
const overrides = parseToolOverrides((agent as { tool_overrides?: unknown }).tool_overrides);
const finalTools = applyToolOverrides(packFiltered, overrides, name => {
  const packId = TOOL_TO_PACK[name];
  if (packId && !activePacks.has(packId)) return undefined;
  return CHAT_TOOL_BY_NAME[name];
});
sessionTools.length = 0;
sessionTools.push(...finalTools);
```

Nota: `accountAgent.portal_email` puede ser null (retrocompat). Usar `?? ''` como fallback si TS quejea; en la práctica todos los orgs modernos tienen portal_email.

- [ ] **Step 3: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0. Si complains sobre portal_email nullable, cambiar a `accountAgent.portal_email ?? ''` — resolveOrgPackContext maneja empty string retornando ctx vacío.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/portal/\[token\]/agent-chat/route.ts
git commit -m "feat(tools): Capa 2 Task 4 — runtime chat aplica filtro por packs

FAB del portal ahora respeta gate de packs. Mismo pattern que email:
preset → +additions → packFilter → −disabled → +enabled (respetando packs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Runtime voice (vapi/sync.ts)

**Files:**
- Modify: `src/lib/vapi/sync.ts` (imports + bloque de overrides inline sobre ToolDef[])

**Interfaces:**
- Consumes: helpers de Task 1.
- Produces: tools voice filtrados por packs antes de escribir a Vapi.

Nota: `ToolDef = Record<string, unknown>`, con name en `tool.function.name`. No es Anthropic.Tool.

- [ ] **Step 1: Agregar imports**

Después del import existente de `parseToolOverrides`:
```typescript
import { parseToolOverrides } from '@/lib/tools/tool-overrides';
import { resolveOrgPackContext, resolveActivePacks, TOOL_TO_PACK } from '@/lib/tools/packs';
```

- [ ] **Step 2: Modificar bloque overrides existente**

Localizar el bloque actual justo antes de `const ids: string[] = [];`:
```typescript
// Capa 3 tool-bloat: overrides finos por meerkat (voice_agents.tool_overrides).
// Aplicar después de todas las adiciones condicionales (org toggles, industria).
const overrides = parseToolOverrides((agent as unknown as { tool_overrides?: unknown }).tool_overrides);
if (overrides.disabled.length > 0) {
  const disabled = new Set(overrides.disabled);
  for (let i = tools.length - 1; i >= 0; i--) {
    const fname = ((tools[i].function as { name?: string } | undefined))?.name;
    if (fname && disabled.has(fname)) tools.splice(i, 1);
  }
}
if (overrides.enabled.length > 0) {
  const present = new Set(tools.map(t => ((t.function as { name?: string } | undefined))?.name).filter(Boolean));
  for (const name of overrides.enabled) {
    if (present.has(name)) continue;
    const def = buildToolDef(name, agent, server);
    if (def) tools.push(def);
  }
}
```

Reemplazar por:
```typescript
// Capa 2 tool-bloat: filtrar por packs activos del org.
const supabaseSyncPacks = createAdminClient();
const packCtx     = await resolveOrgPackContext((agent as unknown as { portal_email?: string | null }).portal_email ?? '', supabaseSyncPacks);
const activePacks = resolveActivePacks(packCtx);
if (activePacks.size < SKILL_PACKS_COUNT_HINT) {
  for (let i = tools.length - 1; i >= 0; i--) {
    const fname = ((tools[i].function as { name?: string } | undefined))?.name;
    if (!fname) continue;
    const packId = TOOL_TO_PACK[fname];
    if (packId && !activePacks.has(packId)) tools.splice(i, 1);
  }
}

// Capa 3 tool-bloat: overrides finos por meerkat (voice_agents.tool_overrides).
const overrides = parseToolOverrides((agent as unknown as { tool_overrides?: unknown }).tool_overrides);
if (overrides.disabled.length > 0) {
  const disabled = new Set(overrides.disabled);
  for (let i = tools.length - 1; i >= 0; i--) {
    const fname = ((tools[i].function as { name?: string } | undefined))?.name;
    if (fname && disabled.has(fname)) tools.splice(i, 1);
  }
}
if (overrides.enabled.length > 0) {
  const present = new Set(tools.map(t => ((t.function as { name?: string } | undefined))?.name).filter(Boolean));
  for (const name of overrides.enabled) {
    if (present.has(name)) continue;
    // Respetar gate de pack: no agregar si pack inactivo
    const packId = TOOL_TO_PACK[name];
    if (packId && !activePacks.has(packId)) continue;
    const def = buildToolDef(name, agent, server);
    if (def) tools.push(def);
  }
}
```

Y agregar arriba del archivo (después del import de packs):
```typescript
import { SKILL_PACKS } from '@/lib/tools/packs';
const SKILL_PACKS_COUNT_HINT = SKILL_PACKS.length; // usado como umbral trivial "hay potenciales dropeos"
```

Nota: `createAdminClient` ya está importado arriba en el archivo (usado por otros bloques). Si no lo está, agregar `import { createAdminClient } from '@/lib/supabase/admin';`.

- [ ] **Step 3: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Verificar que no rompe existing voice sync**

Sanity: revisar que agentes existentes (Sofía, Nia, Noah) SIGUEN teniendo sus tools después del filter. Como sus presets no tienen tools de packs INACTIVOS (Pneuma no tiene QB → Noah preset no incluye qb_* después del filtro Capa 2), el number de tools puede bajar pero comportamiento es correcto.

Skip test real hasta que Vapi key esté resuelto (ver [[handoff-post-flujo-manual-pendientes]]).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vapi/sync.ts
git commit -m "feat(tools): Capa 2 Task 5 — runtime voice aplica filtro por packs

syncAgentToVapi ahora filtra tools por packs activos antes de escribir
Vapi assistant. Mismo pattern que chat/email, adaptado a ToolDef shape
(name en tool.function.name).

Voice inicializa supabase client extra dentro del método porque el
parámetro agent no incluye el supabase context de otros callers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: UI badges en IntegrationsHub

**Files:**
- Modify: `src/app/portal/[token]/IntegrationsHub.tsx`

**Interfaces:**
- Consumes: `GET /api/portal/[token]/packs` de Task 2.
- Produces: cada CapabilityRow con QB/SF/ML/etc. muestra badge "N tools habilitadas" cuando el pack está activo + tooltip listando tools + modal preventivo al desconectar.

- [ ] **Step 1: Agregar fetch al endpoint**

Al top del componente (client component ya, usa hooks), agregar:
```typescript
interface PacksInfo {
  activePacks: string[];
  allPacks: Array<{ id: string; label: string; description: string; tools: string[]; source: string }>;
  meerkatsUsingPack: Record<string, number>;
}

const [packsInfo, setPacksInfo] = useState<PacksInfo | null>(null);

useEffect(() => {
  fetch(`/api/portal/${token}/packs`)
    .then(r => r.ok ? r.json() : null)
    .then(data => setPacksInfo(data as PacksInfo | null))
    .catch(() => setPacksInfo(null));
}, [token]);
```

- [ ] **Step 2: Definir mapping capability → pack**

Después de la definición de `rows` (donde se definen las CapabilityRow), agregar helper:
```typescript
// Mapa de capability key → pack id (para lookup rápido en badges)
const CAPABILITY_TO_PACK: Record<string, string> = {
  finanzas:            'quickbooks',
  solucion_factible:   'invoicing_cfdi',
  comercio:            'mercado_libre',  // Reactivar cuando aplique
  outbound:            'outbound_calls',
  storage:             'cloud_catalog',  // Storage habilita cloud_catalog
};

function packForCapability(key: string): typeof packsInfo.allPacks[number] | null {
  if (!packsInfo) return null;
  const packId = CAPABILITY_TO_PACK[key];
  if (!packId) return null;
  return packsInfo.allPacks.find(p => p.id === packId) ?? null;
}

function isPackActive(key: string): boolean {
  if (!packsInfo) return false;
  const packId = CAPABILITY_TO_PACK[key];
  return packId ? packsInfo.activePacks.includes(packId) : false;
}

function meerkatsUsingCap(key: string): number {
  if (!packsInfo) return 0;
  const packId = CAPABILITY_TO_PACK[key];
  return packId ? (packsInfo.meerkatsUsingPack[packId] ?? 0) : 0;
}
```

- [ ] **Step 3: Enriquecer CapabilityRow con badge**

Localizar el componente `<CapabilityRow>` y agregar prop opcional `packBadge`. Ejemplo del render (dentro del map de rows):

```typescript
{rows.map((r, idx) => {
  const pack = packForCapability(r.key);
  const active = isPackActive(r.key);
  const meerkatsCount = meerkatsUsingCap(r.key);

  const packBadge = pack && active
    ? {
        label: `${pack.tools.length} tools habilitadas`,
        tooltip: `Al conectar habilitas: ${pack.tools.join(', ')}`,
        meerkatsUsing: meerkatsCount,
      }
    : null;

  return (
    <CapabilityRow
      key={r.key}
      icon={r.icon}
      connectedIcon={r.connectedIcon}
      label={r.label}
      subtitle={r.subtitle}
      connected={r.connected}
      isLast={idx === rows.length - 1}
      packBadge={packBadge}
    >
      {r.children}
    </CapabilityRow>
  );
})}
```

- [ ] **Step 4: Actualizar CapabilityRow (o crear inline si no está en este archivo)**

Buscar la definición de `CapabilityRow` (probablemente en el mismo archivo o en `src/app/portal/[token]/CapabilityRow.tsx`). Agregar prop `packBadge?: { label: string; tooltip: string; meerkatsUsing: number } | null` y renderizar:
```tsx
{packBadge && (
  <div
    className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
    style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
    title={packBadge.tooltip}
  >
    {packBadge.label}
  </div>
)}
```

- [ ] **Step 5: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: Sanity visual (skip si no puedes correr el dev server)**

Si tienes el dev server corriendo, abrir `/portal/{pneuma-token}` sección Integraciones. Como Pneuma no tiene QB/SF conectados, esos rows NO deben tener badge. Cuando Nazre conecte QB en test → refresh → badge aparece.

Skip si no puedes correr dev server; la lógica está cubierta por typecheck + endpoint.

- [ ] **Step 7: Commit**

```bash
git add src/app/portal/\[token\]/IntegrationsHub.tsx
git commit -m "feat(tools): Capa 2 Task 6 — UI badges en IntegrationsHub

Cada CapabilityRow ahora muestra badge 'N tools habilitadas' cuando el
pack asociado está activo. Tooltip lista los nombres exactos de las tools
que se habilitan al conectar la integración.

Fetch al endpoint /api/portal/[token]/packs al mount. Sin refresh
automático (owner puede hacer refresh manual tras conectar/desconectar).

CAPABILITY_TO_PACK: mapping local entre keys de capability y ids de pack.
Modal preventivo al desconectar (con conteo de meerkats afectados) queda
como followup — la data ya está expuesta pero no la modal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Metadata pack en registry.ts

**Files:**
- Modify: `src/lib/tools/registry.ts` (agregar campo opcional `pack: string | null` a ToolEntry + poblar en cada entry existente)

**Interfaces:**
- Consumes: `TOOL_TO_PACK` de Task 1.
- Produces: ToolEntry incluye `pack: string | null` para que /admin/tools muestre pertenencia. Sin cambios en runtime.

- [ ] **Step 1: Agregar campo al interface**

Localizar `interface ToolEntry` en registry.ts. Agregar:
```typescript
export interface ToolEntry {
  name:           string;
  description:    string;
  channels:       Channel[];
  category:       string;
  capability:     string | null;
  policy:         ToolPolicy;
  destructive:    boolean;
  gatedByRole:    string[] | null;
  gatedByFeature: string | null;  // DEPRECATED — usar pack. Se removerá en Fase 2.
  pack:           string | null;  // ID del pack en SKILL_PACKS, o null si tool no pertenece a pack
}
```

- [ ] **Step 2: Agregar import de TOOL_TO_PACK**

Al top del archivo:
```typescript
import { TOOL_TO_PACK } from './packs';
```

- [ ] **Step 3: Poblar `pack` en cada entry via helper**

En lugar de editar 60+ entries manualmente, usar map al final del array:
```typescript
export const TOOL_REGISTRY: ToolEntry[] = [
  // ... entries existentes sin cambios ...
].map(entry => ({
  ...entry,
  pack: TOOL_TO_PACK[entry.name] ?? null,
}));
```

- [ ] **Step 4: Verificar typecheck limpio**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: (Opcional) Verificar consistencia gatedByFeature ↔ pack**

Agregar test unitario en `src/lib/tools/__tests__/packs.test.ts`:
```typescript
import { TOOL_REGISTRY } from '../registry';

describe('registry ↔ packs consistency', () => {
  it('every gatedByFeature entry has a pack assigned', () => {
    const drift = TOOL_REGISTRY.filter(t => t.gatedByFeature && !t.pack);
    if (drift.length > 0) {
      throw new Error(`Tools con gatedByFeature sin pack: ${drift.map(t => t.name).join(', ')}`);
    }
  });
});
```

Correr: `npx vitest run src/lib/tools/__tests__/packs.test.ts`. Expected: PASS. Si falla, revisar mapping SKILL_PACKS ↔ tools que hoy tienen gatedByFeature. Ajustar la definición del pack para incluir esas tools.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/registry.ts src/lib/tools/__tests__/packs.test.ts
git commit -m "feat(tools): Capa 2 Task 7 — pack metadata en registry.ts

Agrega campo pack: string | null a ToolEntry. Poblado via TOOL_TO_PACK
en un map al final del array (evita editar 60+ entries manualmente).

/admin/tools ahora puede mostrar a qué pack pertenece cada tool.
gatedByFeature marcado como DEPRECATED — se removerá en Fase 2 tras
2 semanas de validación en prod.

Test unitario nuevo verifica que toda tool con gatedByFeature tiene pack
asignado (evita drift).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Validación final post-implementación

Después de shippear las 7 tasks:

1. **Typecheck**: `npx tsc --noEmit` → exit 0.
2. **Unit tests**: `npx vitest run src/lib/tools/__tests__/packs.test.ts` → PASS.
3. **Manual sanity** (Pneuma, sin QB/SF/ML):
   - Chat con Nox → NO debe intentar tools qb_* (dropeadas por pack inactivo).
   - Correo entrante procesado por Nash → sin cambios (Nash no tiene tools de packs).
4. **Manual sanity** (AC piloto cuando desbloquee):
   - Nala en chat → SÍ debe recibir qb_* + sf_* si `qb_integrations` y `organizations.invoicing_provider` están seteados. Si desconectan QB → pack quickbooks desactivado → Nala pierde qb_* automáticamente sin tocar preset.
5. **Endpoint sanity**: `curl /api/portal/{token}/packs` retorna JSON válido con las 3 keys.
6. **UI sanity**: refresh de Integraciones muestra badges en tarjetas conectadas.

Si alguna validación falla, no marcar Fase 1 como shipped — iterar.

## Followup (fuera de scope de este plan)

- **Fase 2**: remove `gatedByFeature` de ToolEntry + del código que aún lo consulte (búsqueda: `gatedByFeature`). Después de 2 semanas de validación en prod y sin bugs reportados.
- **Modal preventivo al desconectar**: usar `meerkatsUsingPack` que ya expone el endpoint. Requiere hook en el flujo de desconexión de cada integración (QuickBooksSection, SolucionFactibleSection, etc.).
- **Refresh automático de packs tras conectar/desconectar**: hoy requiere refresh manual del owner. Un pub/sub simple (revalidatePath o SWR mutate) lo resolvería.
- **Migración de features per-meerkat a organizations.features**: hoy `anyFeature(key)` recorre voice_agents. Cuando Nazre decida (ver Preguntas Abiertas del spec), migrar HR/civic/etc. a organizations.features y simplificar resolveOrgPackContext.

## Self-Review

Coverage check:
- Spec sección 1 (Pack definition) → Task 1
- Spec sección 2 (Estado derivado) → Task 1 (`resolveOrgPackContext`, `resolveActivePacks`, `filterByActivePacks`)
- Spec sección 3 (Runtime integration) → Tasks 3, 4, 5 (email, chat, voice)
- Spec sección 4 (UI en IntegrationsHub) → Task 6 (badge + tooltip). Modal preventivo mencionado como followup — data expuesta en endpoint (Task 2) pero UI diferida.
- Spec sección 5 (Migration path Fase 1) → Task 7 (agrega pack field, gatedByFeature deprecated pero mantenido).
- Spec sección 6 (Interacción con Capa 3) → Tasks 3, 4, 5 (applyToolOverrides con getTool que respeta packs).
- Spec sección Tests → Task 1 (invariantes + filter) + Task 7 (registry consistency).

Placeholder scan: ninguno. Cada task tiene código concreto en cada step.

Type consistency: `OrgPackContext`, `SkillPack`, `TOOL_TO_PACK`, `resolveOrgPackContext`, `resolveActivePacks`, `filterByActivePacks` — nombres idénticos en spec, plan y todos los tasks.

Scope check: Fase 1 completa en 7 tasks bite-sized. Modal preventivo y refresh automático explícitos como followups fuera de scope. Migración de features per-meerkat también followup.

Ambiguity check:
- "features per-meerkat" vs "features org-wide" — resuelto con `anyFeature(key)` en resolveOrgPackContext, documentado en JSDoc.
- Orden de aplicación: (preset ∪ universales) ∩ packs − disabled + enabled — explícito en cada task de runtime.
- Endpoint retorna `allPacks` sin `activeCheck` (no serializable): explícito en Task 2 con destructuring `_ = activeCheck, ...rest`.
