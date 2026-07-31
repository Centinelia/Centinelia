# Observabilidad segmentada implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard admin `/admin/observabilidad` que rebana métricas de producción por `meerkat_version × active_flags`, con snapshot en el webhook y backfill best-effort para el histórico.

**Architecture:** Snapshot al insert de `voice_calls` (columnas nuevas `meerkat_id`, `meerkat_version`, `active_flags`, `latency_ms_p50/p95`) resueltos vía helpers reutilizables sobre los pilares 1 y 3. Dashboard hace queries en vivo por page load, agregando en TS (voy con esto en MVP, no PostgreSQL RPC). Fallbacks silenciosos: el webhook nunca falla por metadata de observabilidad.

**Tech Stack:** Next.js 16 (proxy.ts middleware, cookies() async), Supabase JS, TypeScript estricto, Tailwind + estilos inline var(--c-*), Lucide icons.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-07-31-observabilidad-segmentada-design.md`
- **Copy en español, sin em-dash** — sustituir `—` con `:`, `,` o `.`
- **Sin emojis en UI** — solo iconos Lucide
- **Sin "IA" en copy visible del portal / landing** (admin es interno; permitido pero preferir "empleado digital")
- **Sin tests unitarios** — el repo no tiene framework configurado. Verificar con `npx tsc --noEmit`, `npm run build`, y smoke real (curl / llamada Vapi / query SQL).
- **Fix-forward** — sin backwards compat shims ni feature flags de rollback (columnas son aditivas y nullable, no rompen nada).
- **Migración ya corrida** en Supabase el 2026-07-31: `voice_calls` ya tiene las 5 columnas nuevas + índices. **No tocar esa migración.**
- **Dev bypass en `proxy.ts`** debe seguir funcionando (`NODE_ENV=development` sin auth).
- **Commits incrementales** — un commit por task completada.

---

## File Structure

**Nuevos:**
- `src/lib/feature-flags/all-active.ts` : `evaluateFlagsForOrg(orgEmail)` → `Promise<string[]>` de flag_keys ON
- `src/lib/vapi/meerkat-map.ts` : `getMeerkatIdForAgentRow(agent)` → `string | null` (sync)
- `scripts/backfill/observability-voice-calls.ts` : one-shot backfill
- `src/app/admin/observabilidad/page.tsx` : server component gate + fetch + render
- `src/app/admin/observabilidad/ObservabilityView.tsx` : client component controls + tabla
- `src/app/admin/observabilidad/queries.ts` : `fetchObservabilityData(filters)` + agg
- `src/app/admin/observabilidad/types.ts` : `MeerkatObservabilityRow`, `ObsFilters`

**Modificados:**
- `src/lib/feature-flags/evaluator.ts` : exportar nueva función `getAllFlagKeys()`
- `src/app/api/voice/webhook/route.ts` : extender select de agent + snapshot en insert
- `src/app/admin/AdminNav.tsx` : agregar link a `/admin/observabilidad`

---

## Task 1 — Helper `evaluateFlagsForOrg`

**Files:**
- Modify: `src/lib/feature-flags/evaluator.ts` (agregar export)
- Create: `src/lib/feature-flags/all-active.ts`

**Interfaces:**
- Consumes: `loadAll` (privada de evaluator.ts), `isFeatureEnabled` (ya exportada)
- Produces: `evaluateFlagsForOrg(orgEmail: string): Promise<string[]>` — devuelve flag_keys donde `isFeatureEnabled === true` para esa org

- [ ] **Step 1: Agregar `getAllFlagKeys` a evaluator.ts**

En `src/lib/feature-flags/evaluator.ts`, agregar al final del archivo (después de `evaluate`):

```ts
export async function getAllFlagKeys(): Promise<string[]> {
  const rows = await loadAll();
  return Array.from(rows.keys());
}
```

Usa `loadAll` que ya existe en el mismo archivo (private). Este export es la puerta pública minimal para iterar sobre todas las keys sin exponer el mapa completo.

- [ ] **Step 2: Crear `all-active.ts`**

```ts
import { isFeatureEnabled, getAllFlagKeys } from './evaluator';

export async function evaluateFlagsForOrg(orgEmail: string): Promise<string[]> {
  const keys = await getAllFlagKeys();
  const results = await Promise.all(
    keys.map(async (k) => ((await isFeatureEnabled(k, orgEmail)) ? k : null)),
  );
  return results.filter((k): k is string => k !== null).sort();
}
```

El sort() garantiza determinismo en el JSONB almacenado (útil para queries y debug).

- [ ] **Step 3: Typecheck**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit
```

Expected: PASS (sin errores nuevos).

- [ ] **Step 4: Commit**

```bash
git add src/lib/feature-flags/evaluator.ts src/lib/feature-flags/all-active.ts
git commit -m "feat(feature-flags): evaluateFlagsForOrg helper para snapshot en webhook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Helper `getMeerkatIdForAgentRow`

**Files:**
- Create: `src/lib/vapi/meerkat-map.ts`

**Interfaces:**
- Consumes: `MEERKAT_CONFIGS` de `@/lib/vapi/meerkat-configs`
- Produces: `getMeerkatIdForAgentRow(agent: { features?: unknown }): string | null`

**Contexto:** `voice_agents.features.meerkat_role_id` (JSONB) es el string del meerkat_id ('nia', 'noah', etc.). El helper valida que el id esté en `MEERKAT_CONFIGS` (los 10 meerkats seedeados en pilar 1) y devuelve null si no.

- [ ] **Step 1: Crear archivo**

```ts
import { MEERKAT_CONFIGS } from './meerkat-configs';

export function getMeerkatIdForAgentRow(
  agent: { features?: unknown } | null | undefined,
): string | null {
  if (!agent?.features || typeof agent.features !== 'object') return null;
  const rid = (agent.features as Record<string, unknown>).meerkat_role_id;
  if (typeof rid !== 'string' || !rid) return null;
  if (!MEERKAT_CONFIGS[rid]) return null;
  return rid;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vapi/meerkat-map.ts
git commit -m "feat(vapi): getMeerkatIdForAgentRow helper puro

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Snapshot en webhook

**Files:**
- Modify: `src/app/api/voice/webhook/route.ts` (dos cambios: select del agent + insert de voice_calls)

**Interfaces:**
- Consumes: `getMeerkatIdForAgentRow` (Task 2), `resolveMeerkatVersionForAgent` (existente), `evaluateFlagsForOrg` (Task 1)
- Produces: filas nuevas de `voice_calls` con las 5 columnas de observabilidad populated (o null si el resolver no pudo).

**Notas críticas:**
- La signatura real de `resolveMeerkatVersionForAgent(meerkatId, agent)` requiere `agent: { portal_email, features }` — hay que extender el select del webhook para incluir `features`.
- El webhook resuelve `resolvedAgentId` a partir de metadata; el agent row completo NO se selecciona en ese branch. Hay que agregar un fetch adicional del agent row (o extender el select existente si ya se hace uno en ese path).
- Latencia: Vapi devuelve varios campos en `call.messages` / `call.performanceMetrics`. En MVP capturar lo que exista; si el path no matchea, guardar `null`. NO bloquear el insert.
- Fallbacks: cualquier throw en los resolvers va a try/catch y se guarda null.

- [ ] **Step 1: Agregar imports arriba del archivo**

En `src/app/api/voice/webhook/route.ts`, junto a los imports existentes:

```ts
import { getMeerkatIdForAgentRow } from '@/lib/vapi/meerkat-map';
import { resolveMeerkatVersionForAgent } from '@/lib/feature-flags/version-flag-resolver';
import { evaluateFlagsForOrg } from '@/lib/feature-flags/all-active';
```

- [ ] **Step 2: Extraer helper `resolveObservabilitySnapshot`**

Al final del archivo (fuera del handler `POST`), agregar:

```ts
type ObsSnapshot = {
  meerkat_id: string | null;
  meerkat_version: number | null;
  active_flags: string[] | null;
  latency_ms_p50: number | null;
  latency_ms_p95: number | null;
};

async function resolveObservabilitySnapshot(
  agentRow: { id: string; portal_email: string | null; features: unknown } | null,
  call: unknown,
): Promise<ObsSnapshot> {
  const empty: ObsSnapshot = {
    meerkat_id: null,
    meerkat_version: null,
    active_flags: null,
    latency_ms_p50: null,
    latency_ms_p95: null,
  };
  if (!agentRow) return empty;

  let meerkatId: string | null = null;
  let meerkatVer: number | null = null;
  let activeFlags: string[] | null = null;

  try {
    meerkatId = getMeerkatIdForAgentRow(agentRow);
    if (meerkatId) {
      meerkatVer = await resolveMeerkatVersionForAgent(meerkatId, {
        portal_email: agentRow.portal_email,
        features: (agentRow.features as Record<string, unknown>) ?? {},
      });
    }
  } catch (e) {
    console.warn('[obs] meerkat resolve failed', { agentId: agentRow.id, error: String(e) });
  }

  try {
    if (agentRow.portal_email) {
      activeFlags = await evaluateFlagsForOrg(agentRow.portal_email);
    }
  } catch (e) {
    console.warn('[obs] flags resolve failed', { agentId: agentRow.id, error: String(e) });
  }

  const c = call as Record<string, unknown> | null | undefined;
  const metrics = (c?.performanceMetrics ?? (c?.metrics as Record<string, unknown> | undefined)) as
    | Record<string, unknown>
    | undefined;
  const latencyMs = (metrics?.latency ?? metrics?.latencyMs) as
    | Record<string, unknown>
    | undefined;

  const toInt = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

  return {
    meerkat_id: meerkatId,
    meerkat_version: meerkatVer,
    active_flags: activeFlags,
    latency_ms_p50: toInt(latencyMs?.p50),
    latency_ms_p95: toInt(latencyMs?.p95),
  };
}
```

- [ ] **Step 3: Extender el fetch del agent en el branch `end-of-call-report`**

Localizar el bloque de `end-of-call-report` (aproximadamente line 95-135). Después de obtener `resolvedAgentId` (~line 133) y antes del insert de `voice_calls` (~line 151), agregar:

```ts
const { data: agentRow } = await supabase
  .from('voice_agents')
  .select('id, portal_email, features')
  .eq('id', resolvedAgentId)
  .maybeSingle();

const obs = await resolveObservabilitySnapshot(agentRow, call);
```

- [ ] **Step 4: Extender el insert de `voice_calls`**

Localizar el insert existente (~line 151). Agregar los 5 campos al final del objeto insertado:

```ts
const { data: callRow, error: callInsertError } = await supabase.from('voice_calls').insert({
  agent_id:            resolvedAgentId,
  vapi_call_id:        call?.id ?? null,
  caller_number:       callerNumber,
  duration_seconds:    durationSeconds,
  transcript,
  summary,
  recording_url:       recordingUrl,
  outcome,
  lead_created:        outcome === 'lead_created',
  appointment_created: outcome === 'appointment_booked',
  order_created:       outcome === 'order_taken',
  transferred:         outcome === 'transferred',
  cost_usd:            call?.cost ?? null,
  nivel_interes:        structured?.nivel_interes       ?? null,
  acciones_pendientes:  structured?.acciones_pendientes ?? null,
  meerkat_id:          obs.meerkat_id,
  meerkat_version:     obs.meerkat_version,
  active_flags:        obs.active_flags,
  latency_ms_p50:      obs.latency_ms_p50,
  latency_ms_p95:      obs.latency_ms_p95,
}).select('id').single();
```

- [ ] **Step 5: Typecheck + build**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit && npm run build
```

Expected: build completa sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice/webhook/route.ts
git commit -m "feat(webhook): snapshot de meerkat_version + active_flags + latencia por call

Pilar 5 observabilidad. Los 5 campos son nullable y los resolvers no rompen
el insert si fallan. Latencia captura call.performanceMetrics.latency o
call.metrics.latencyMs; guarda null si Vapi no lo expone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Backfill script

**Files:**
- Create: `scripts/backfill/observability-voice-calls.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `getMeerkatIdForAgentRow`, `MEERKAT_CONFIGS`
- Produces: filas de `voice_calls` pre-deploy con `meerkat_id + meerkat_version` populated; `active_flags` y latencia se dejan null (no reconstruibles).

**Ejecución:** manual, una vez, después del deploy del webhook. Idempotente.

- [ ] **Step 1: Verificar que existe carpeta `scripts/backfill/`**

```bash
ls /c/Users/Nazre/centinelia/scripts/backfill/ 2>&1 || mkdir -p /c/Users/Nazre/centinelia/scripts/backfill
```

Si no existe, la crea.

- [ ] **Step 2: Crear script**

```ts
#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createAdminClient } from '../../src/lib/supabase/admin';
import { getMeerkatIdForAgentRow } from '../../src/lib/vapi/meerkat-map';

const BATCH_SIZE = 500;
const SLEEP_MS = 200;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CallRow { id: string; agent_id: string; created_at: string; }
interface AgentRow { id: string; features: unknown; }
interface HistoryRow { to_version: number; changed_at: string; }

async function main() {
  const supabase = createAdminClient();

  // Cache: agent_id → meerkat_id (evita repetir lookups)
  const agentToMeerkat = new Map<string, string | null>();

  async function meerkatIdFor(agentId: string): Promise<string | null> {
    if (agentToMeerkat.has(agentId)) return agentToMeerkat.get(agentId) ?? null;
    const { data } = await supabase
      .from('voice_agents')
      .select('id, features')
      .eq('id', agentId)
      .maybeSingle<AgentRow>();
    const mid = getMeerkatIdForAgentRow(data);
    agentToMeerkat.set(agentId, mid);
    return mid;
  }

  async function versionAt(meerkatId: string, at: string): Promise<number> {
    const { data } = await supabase
      .from('meerkat_version_history')
      .select('to_version, changed_at')
      .eq('meerkat_id', meerkatId)
      .lte('changed_at', at)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle<HistoryRow>();
    return data?.to_version ?? 1;
  }

  let totalUpdated = 0;
  let cursor = 0;

  // Loop de páginas — usa range para cursor
  while (true) {
    const { data: calls, error } = await supabase
      .from('voice_calls')
      .select('id, agent_id, created_at')
      .is('meerkat_id', null)
      .order('created_at', { ascending: true })
      .range(cursor, cursor + BATCH_SIZE - 1)
      .returns<CallRow[]>();

    if (error) {
      console.error('[backfill] fetch error', error.message);
      process.exit(1);
    }
    if (!calls || calls.length === 0) break;

    for (const call of calls) {
      const mid = await meerkatIdFor(call.agent_id);
      if (!mid) continue; // sin meerkat, dejar null

      const ver = await versionAt(mid, call.created_at);
      const { error: upErr } = await supabase
        .from('voice_calls')
        .update({ meerkat_id: mid, meerkat_version: ver })
        .eq('id', call.id);

      if (upErr) {
        console.error('[backfill] update error', call.id, upErr.message);
        continue;
      }
      totalUpdated++;
    }

    console.log(`[backfill] batch done. cursor=${cursor} updated_total=${totalUpdated}`);
    cursor += BATCH_SIZE;
    await sleep(SLEEP_MS);
  }

  console.log(`[backfill] done. updated=${totalUpdated}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Typecheck del script**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit --module esnext --moduleResolution bundler scripts/backfill/observability-voice-calls.ts 2>&1 | head -20
```

Expected: PASS o solo errores de imports que se resuelven con `tsx` en runtime (aceptable — el script corre con `npx tsx`).

Si el typecheck se queja de módulos, hacer typecheck del proyecto entero:

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit
```

- [ ] **Step 4: Smoke local (dry-run mental — no ejecutar contra prod aún)**

Verificar que el script arranca sin crashear leyendo la primera batch:

```bash
cd /c/Users/Nazre/centinelia && npx tsx scripts/backfill/observability-voice-calls.ts
```

**NO ejecutar en prod todavía.** Correr en local es seguro (usa .env.local; si apunta a prod, entonces sí actualiza — verificar antes). Si `.env.local` apunta a prod Supabase, saltarse este step y esperar al rollout (Task 8).

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill/observability-voice-calls.ts
git commit -m "feat(scripts): backfill de meerkat_id + meerkat_version en voice_calls historicas

Batches de 500 con sleep 200ms. Idempotente (skip rows con meerkat_id NOT NULL).
active_flags y latencia se dejan null: no reconstruibles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Queries de agregación del dashboard

**Files:**
- Create: `src/app/admin/observabilidad/types.ts`
- Create: `src/app/admin/observabilidad/queries.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `MEERKAT_CONFIGS`
- Produces:
  - `type ObsWindow = '24h' | '7d' | '30d' | 'since_activation'`
  - `type ObsFilters = { window: ObsWindow; meerkatIds: string[] | null; flagKey: string | null; includeUnattributed: boolean }`
  - `type MeerkatObservabilityRow = { meerkat_id, meerkat_version | 'unattributed', calls, autonomia_pct, ces_avg, cost_avg, lat_p50, lat_p95 }`
  - `fetchObservabilityData(filters: ObsFilters): Promise<MeerkatObservabilityRow[]>`

**Decisión de agregación:** en MVP agregamos en TS (fetch rows + reduce). Es suficiente hasta ~100k rows/query. Si crece, migrar a Postgres RPC. NO tocar la migración ya corrida.

- [ ] **Step 1: Crear `types.ts`**

```ts
export type ObsWindow = '24h' | '7d' | '30d' | 'since_activation';

export interface ObsFilters {
  window:               ObsWindow;
  meerkatIds:           string[] | null; // null = todos
  flagKey:              string | null;   // null = sin filtro
  includeUnattributed:  boolean;
}

export interface MeerkatObservabilityRow {
  meerkat_id:       string | 'unattributed';
  meerkat_version:  number | null; // null si unattributed
  calls:            number;
  autonomia_pct:    number | null; // 0..100
  ces_avg:          number | null; // 0..5
  cost_avg:         number | null; // usd
  lat_p50:          number | null; // ms
  lat_p95:          number | null; // ms
}
```

- [ ] **Step 2: Crear `queries.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { ObsFilters, MeerkatObservabilityRow, ObsWindow } from './types';

interface RawCall {
  meerkat_id:      string | null;
  meerkat_version: number | null;
  active_flags:    string[] | null;
  outcome:         string;
  ces_data:        { overall?: number } | null;
  cost_usd:        number | null;
  latency_ms_p50:  number | null;
  latency_ms_p95:  number | null;
}

function windowStart(w: ObsWindow): Date {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (w) {
    case '24h': return new Date(now - day);
    case '7d':  return new Date(now - 7 * day);
    case '30d': return new Date(now - 30 * day);
    case 'since_activation': return new Date(now - 30 * day); // MVP: como 30d hasta que tengamos anchor por flag
  }
}

const AUTONOMOUS_EXCLUDED = new Set(['transferred', 'escalated_whatsapp']);

function pct(n: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((n / total) * 1000) / 10;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function fetchObservabilityData(filters: ObsFilters): Promise<MeerkatObservabilityRow[]> {
  const supabase = createAdminClient();
  const since = windowStart(filters.window).toISOString();

  let query = supabase
    .from('voice_calls')
    .select('meerkat_id, meerkat_version, active_flags, outcome, ces_data, cost_usd, latency_ms_p50, latency_ms_p95')
    .gte('created_at', since);

  if (filters.meerkatIds && filters.meerkatIds.length > 0) {
    query = query.in('meerkat_id', filters.meerkatIds);
  }
  if (filters.flagKey) {
    query = query.contains('active_flags', [filters.flagKey]);
  }

  const { data, error } = await query.returns<RawCall[]>();
  if (error) throw new Error(`observability query failed: ${error.message}`);

  const rows = data ?? [];

  // Agrupar por (meerkat_id, meerkat_version)
  const groups = new Map<string, RawCall[]>();
  for (const r of rows) {
    const key = r.meerkat_id
      ? `${r.meerkat_id}::v${r.meerkat_version ?? '?'}`
      : 'unattributed::null';
    if (!filters.includeUnattributed && !r.meerkat_id) continue;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const result: MeerkatObservabilityRow[] = [];
  for (const [key, group] of groups) {
    const [midPart, verPart] = key.split('::');
    const isUnattr = midPart === 'unattributed';
    const autonomous = group.filter(r => !AUTONOMOUS_EXCLUDED.has(r.outcome)).length;
    const cesValues  = group.map(r => r.ces_data?.overall).filter((v): v is number => typeof v === 'number');
    const costValues = group.map(r => r.cost_usd).filter((v): v is number => typeof v === 'number');
    const lat50s     = group.map(r => r.latency_ms_p50).filter((v): v is number => typeof v === 'number');
    const lat95s     = group.map(r => r.latency_ms_p95).filter((v): v is number => typeof v === 'number');

    result.push({
      meerkat_id:      isUnattr ? 'unattributed' : midPart,
      meerkat_version: isUnattr ? null : Number(verPart.slice(1)),
      calls:           group.length,
      autonomia_pct:   pct(autonomous, group.length),
      ces_avg:         avg(cesValues),
      cost_avg:        avg(costValues),
      lat_p50:         percentile(lat50s, 0.5),
      lat_p95:         percentile(lat95s, 0.95),
    });
  }

  // Ordenar: primero por meerkat_id alfabético, luego version ASC, unattributed al final
  result.sort((a, b) => {
    if (a.meerkat_id === 'unattributed') return 1;
    if (b.meerkat_id === 'unattributed') return -1;
    if (a.meerkat_id !== b.meerkat_id) return a.meerkat_id.localeCompare(b.meerkat_id);
    return (a.meerkat_version ?? 0) - (b.meerkat_version ?? 0);
  });

  return result;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/observabilidad/types.ts src/app/admin/observabilidad/queries.ts
git commit -m "feat(admin): fetchObservabilityData con agregacion en TS

Query en vivo por page load. Agrupa por (meerkat_id, meerkat_version).
Calcula autonomia, CES avg, costo avg, latencia p50/p95. MVP sin RPC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Dashboard UI

**Files:**
- Create: `src/app/admin/observabilidad/page.tsx` (server)
- Create: `src/app/admin/observabilidad/ObservabilityView.tsx` (client)

**Interfaces:**
- Consumes: `fetchObservabilityData` (Task 5), `MEERKAT_CONFIGS`, `getAllFlagKeys` (Task 1)
- Produces: página en `/admin/observabilidad`, gated por cookie `Centinelia_admin` == `ADMIN_SECRET`

- [ ] **Step 1: Crear `page.tsx` (server component)**

```tsx
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAllFlagKeys } from '@/lib/feature-flags/evaluator';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { ObservabilityView } from './ObservabilityView';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function ObservabilityPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const [flagKeys] = await Promise.all([getAllFlagKeys()]);
  const meerkatIds = Object.keys(MEERKAT_CONFIGS).sort();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Observabilidad segmentada</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Metricas de produccion rebanadas por version de empleado y flags activos.
        </p>
      </div>
      <ObservabilityView meerkatIds={meerkatIds} flagKeys={flagKeys.sort()} />
    </div>
  );
}
```

- [ ] **Step 2: Crear route handler para queries client-side**

Necesitamos un endpoint que el client component pueda llamar cuando cambien filtros (server component solo corre en el first load). Crear `src/app/api/admin/observabilidad/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchObservabilityData } from '@/app/admin/observabilidad/queries';
import type { ObsFilters, ObsWindow } from '@/app/admin/observabilidad/types';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

const VALID_WINDOWS: ObsWindow[] = ['24h', '7d', '30d', 'since_activation'];

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const w = url.searchParams.get('window') as ObsWindow | null;
  const window: ObsWindow = w && VALID_WINDOWS.includes(w) ? w : '24h';
  const meerkatIdsParam = url.searchParams.get('meerkat_ids');
  const meerkatIds = meerkatIdsParam ? meerkatIdsParam.split(',').filter(Boolean) : null;
  const flagKey = url.searchParams.get('flag_key');
  const includeUnattributed = url.searchParams.get('include_unattributed') === '1';

  const filters: ObsFilters = { window, meerkatIds, flagKey, includeUnattributed };

  try {
    const data = await fetchObservabilityData(filters);
    return NextResponse.json({ rows: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Crear `ObservabilityView.tsx` (client component)**

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import type { MeerkatObservabilityRow, ObsWindow } from './types';

interface Props {
  meerkatIds: string[];
  flagKeys:   string[];
}

const WINDOWS: { value: ObsWindow; label: string }[] = [
  { value: '24h',              label: '24h' },
  { value: '7d',               label: '7 dias' },
  { value: '30d',              label: '30 dias' },
  { value: 'since_activation', label: 'Desde activacion' },
];

export function ObservabilityView({ meerkatIds, flagKeys }: Props) {
  const [window, setWindow] = useState<ObsWindow>('24h');
  const [selectedMeerkats, setSelectedMeerkats] = useState<string[]>([]);
  const [flagKey, setFlagKey] = useState<string>('');
  const [includeUnattr, setIncludeUnattr] = useState(false);
  const [rows, setRows] = useState<MeerkatObservabilityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const params = new URLSearchParams({ window });
    if (selectedMeerkats.length > 0) params.set('meerkat_ids', selectedMeerkats.join(','));
    if (flagKey) params.set('flag_key', flagKey);
    if (includeUnattr) params.set('include_unattributed', '1');

    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/admin/observabilidad?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'fetch failed');
        setRows(json.rows ?? []);
      } catch (e) {
        setError(String(e));
        setRows([]);
      }
    });
  }, [window, selectedMeerkats, flagKey, includeUnattr]);

  const toggleMeerkat = (id: string) => {
    setSelectedMeerkats(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const grouped = new Map<string, MeerkatObservabilityRow[]>();
  for (const r of rows) {
    const key = r.meerkat_id;
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className="px-3 py-1.5 rounded-md text-sm transition-all"
              style={{
                color: window === w.value ? '#FAFBFF' : 'var(--c-text-2)',
                background: window === w.value ? '#6C3BFF' : 'transparent',
                fontWeight: window === w.value ? 600 : 400,
              }}
            >
              {w.label}
            </button>
          ))}
        </div>

        <select
          value={flagKey}
          onChange={e => setFlagKey(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        >
          <option value="">Todos los flags</option>
          {flagKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
          <input
            type="checkbox"
            checked={includeUnattr}
            onChange={e => setIncludeUnattr(e.target.checked)}
          />
          Incluir sin atribucion
        </label>

        {pending && <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>cargando...</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {meerkatIds.map(id => (
          <button
            key={id}
            onClick={() => toggleMeerkat(id)}
            className="px-3 py-1 rounded-full text-xs transition-all"
            style={{
              background: selectedMeerkats.includes(id) ? '#6C3BFF' : 'var(--c-surface)',
              color: selectedMeerkats.includes(id) ? '#FAFBFF' : 'var(--c-text-2)',
              border: '1px solid var(--c-border)',
            }}
          >
            {id}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-md text-sm" style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {grouped.size === 0 && !pending && (
        <div className="p-6 rounded-lg text-center text-sm" style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)' }}>
          Sin datos en la ventana seleccionada.
        </div>
      )}

      {Array.from(grouped.entries()).map(([mid, group]) => (
        <MeerkatTable key={mid} meerkatId={mid} rows={group} />
      ))}
    </div>
  );
}

function fmt(v: number | null, decimals: number, suffix = ''): string {
  if (v == null) return '—';
  return v.toFixed(decimals) + suffix;
}

function delta(cur: number | null, prev: number | null): string {
  if (cur == null || prev == null || prev === 0) return '';
  const diff = ((cur - prev) / Math.abs(prev)) * 100;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
  const color = diff > 0 ? '#22C55E' : diff < 0 ? '#EF4444' : 'var(--c-text-3)';
  return `<span style="color:${color};margin-left:4px">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
}

function MeerkatTable({ meerkatId, rows }: { meerkatId: string; rows: MeerkatObservabilityRow[] }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
      <div className="px-4 py-2 font-semibold text-sm" style={{ color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)' }}>
        {meerkatId.toUpperCase()}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--c-text-3)' }}>
            <th className="text-left px-4 py-2 font-normal">Version</th>
            <th className="text-right px-4 py-2 font-normal">Calls</th>
            <th className="text-right px-4 py-2 font-normal">Autonomia</th>
            <th className="text-right px-4 py-2 font-normal">CES avg</th>
            <th className="text-right px-4 py-2 font-normal">Costo/call</th>
            <th className="text-right px-4 py-2 font-normal">p50 lat</th>
            <th className="text-right px-4 py-2 font-normal">p95 lat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = i > 0 ? rows[i - 1] : null;
            const label = r.meerkat_version == null ? 'sin attr' : `v${r.meerkat_version}`;
            return (
              <tr key={label} style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
                <td className="px-4 py-2">{label}</td>
                <td className="text-right px-4 py-2">{r.calls}</td>
                <td className="text-right px-4 py-2" dangerouslySetInnerHTML={{ __html: fmt(r.autonomia_pct, 1, '%') + delta(r.autonomia_pct, prev?.autonomia_pct ?? null) }} />
                <td className="text-right px-4 py-2" dangerouslySetInnerHTML={{ __html: fmt(r.ces_avg, 2) + delta(r.ces_avg, prev?.ces_avg ?? null) }} />
                <td className="text-right px-4 py-2" dangerouslySetInnerHTML={{ __html: '$' + fmt(r.cost_avg, 3) + delta(r.cost_avg == null ? null : -r.cost_avg, prev?.cost_avg == null ? null : -prev.cost_avg) }} />
                <td className="text-right px-4 py-2">{fmt(r.lat_p50, 0, 'ms')}</td>
                <td className="text-right px-4 py-2">{fmt(r.lat_p95, 0, 'ms')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

Nota sobre `delta()` para costo: se invierte el signo para que "subir el costo" muestre rojo (peor) en lugar de verde. Match a la intuición de negocio.

- [ ] **Step 4: Typecheck + build**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit && npm run build
```

Expected: build completa. Si hay warnings de `dangerouslySetInnerHTML`, ok — es controlado (no user input).

- [ ] **Step 5: Smoke local**

```bash
cd /c/Users/Nazre/centinelia && npm run dev
```

Navegar a `http://localhost:3000/admin/observabilidad`. Login como admin (o dev bypass debe funcionar por `NODE_ENV=development` en proxy.ts).

Verificar:
- Página carga sin error.
- Selector de ventana funciona (defaultea a 24h).
- Chips de meerkat responden al click.
- Toggle "sin atribucion" cambia rows.
- Si hay calls históricas ya con `meerkat_id` populated (después del backfill), aparecen agrupadas.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/observabilidad/ src/app/api/admin/observabilidad/
git commit -m "feat(admin): dashboard /admin/observabilidad segmentado por version + flag

Server component + route handler + client controls. Ventana 24h/7d/30d,
filtro por meerkat chips y flag_key, toggle sin atribucion. Renderiza una
tabla por meerkat con delta vs version anterior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Nav link

**Files:**
- Modify: `src/app/admin/AdminNav.tsx`

**Interfaces:**
- Consumes: nada
- Produces: link visible en el admin sidebar

- [ ] **Step 1: Agregar import de icono**

En `src/app/admin/AdminNav.tsx` línea 5, agregar `Activity` al import de lucide-react:

```tsx
import { LayoutDashboard, Bot, BarChart3, Plus, CreditCard, FileText, Users, Settings, Phone, Sparkles, Home, Terminal, DollarSign, ShieldCheck, Server, GitBranch, FlaskConical, Flag, Activity } from 'lucide-react';
```

- [ ] **Step 2: Agregar entrada al array `links`**

Insertar después del entry de `Feature flags` (~line 22):

```tsx
  { href: '/admin/observabilidad', icon: Activity,        label: 'Observabilidad' },
```

- [ ] **Step 3: Typecheck**

```bash
cd /c/Users/Nazre/centinelia && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/AdminNav.tsx
git commit -m "feat(admin): nav link a /admin/observabilidad

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Rollout + backfill en prod

**Files:** ninguno (solo verificación y comandos)

**Interfaces:**
- Consumes: todo lo anterior deployado a Vercel
- Produces: dashboard usable en prod con data real atribuida

- [ ] **Step 1: Push a main y esperar deploy Vercel**

```bash
git -C /c/Users/Nazre/centinelia push origin main
```

Esperar ~2 min a que Vercel deploye. Verificar en https://vercel.com/... que el deploy pasa.

- [ ] **Step 2: Smoke check webhook con call real**

Hacer 1 llamada de prueba a Nia (número demo o cualquier agente activo). Después de colgar, verificar:

```bash
CRON=$(grep '^CRON_SECRET=' /c/Users/Nazre/centinelia/.env.local | cut -d= -f2- | tr -d '"')

# Query últimas 5 voice_calls con las cols nuevas
curl -sw "\n%{http_code}\n" \
  -H "apikey: $(grep '^SUPABASE_SERVICE_ROLE_KEY=' /c/Users/Nazre/centinelia/.env.local | cut -d= -f2-)" \
  -H "Authorization: Bearer $(grep '^SUPABASE_SERVICE_ROLE_KEY=' /c/Users/Nazre/centinelia/.env.local | cut -d= -f2-)" \
  "$(grep '^NEXT_PUBLIC_SUPABASE_URL=' /c/Users/Nazre/centinelia/.env.local | cut -d= -f2-)/rest/v1/voice_calls?select=id,agent_id,meerkat_id,meerkat_version,active_flags,latency_ms_p50,latency_ms_p95,created_at&order=created_at.desc&limit=5"
```

Verificar que el último row tiene `meerkat_id`, `meerkat_version` populated. `active_flags` puede ser `[]` (org sin flags activos). Latencia puede ser `null` si Vapi no expuso el path esperado (aceptable en MVP).

- [ ] **Step 3: Correr backfill en prod**

```bash
cd /c/Users/Nazre/centinelia && npx tsx scripts/backfill/observability-voice-calls.ts 2>&1 | tee /tmp/observ-backfill.log
```

Monitorear el output: batches de 500 con progreso. Si el volumen histórico es grande, puede tomar minutos. Idempotente — se puede matar y reintentar.

Verificar al final:

```
[backfill] done. updated=<N>
```

- [ ] **Step 4: Smoke dashboard en prod**

Ir a https://www.centinelia.mx/admin/observabilidad (login admin primero). Verificar:

- Página carga <500ms.
- Vista 24h muestra al menos la call de smoke del Step 2 (Nia v1).
- Vista 30d muestra rows con `meerkat_id` populated por el backfill.
- Toggle "sin atribucion" alterna correctamente.
- Selector de flags lista todos los flags de la tabla.

- [ ] **Step 5: Actualizar memoria `next_session_kickoff.md`**

Editar `C:\Users\Nazre\.claude\projects\C--Users-Nazre\memory\next_session_kickoff.md`:

- Cambiar "Pilar 5 SIGUIENTE" a "Pilar 5 LIVE"
- Actualizar dirección explícita a la siguiente iniciativa (Nazre define, típicamente E2E de flags o extender golden a más meerkats)
- Agregar sección de decisiones de sesión en `MEMORY.md` index

También crear archivo `decisions_centinelia_session52.md` con el resumen de la sesión.

- [ ] **Step 6: Verificación final**

Correr las 2 sanity checks del kickoff para confirmar que nada regresó:

```bash
ADMIN=$(grep '^ADMIN_SECRET=' /c/Users/Nazre/centinelia/.env.local | cut -d= -f2- | tr -d '"')
CRON=$(grep '^CRON_SECRET=' /c/Users/Nazre/centinelia/.env.local | cut -d= -f2- | tr -d '"')

curl -sw "\n%{http_code}\n" -H "Cookie: Centinelia_admin=${ADMIN}" https://www.centinelia.mx/api/admin/flags
curl -sw "\n%{http_code}\n" -H "Authorization: Bearer ${CRON}" https://www.centinelia.mx/api/cron/flags-promote
```

Ambos deben devolver 200.

---

## Notas finales

**Riesgos monitoreados:**
- `ces_data.overall` confirmado que existe (schema `CesData.overall: number` en `src/lib/ai/ces-eval.ts:19`). ✓
- Latencia de Vapi: path exacto no verificado en el SDK. Task 3 Step 2 usa fallbacks `call.performanceMetrics.latency` o `call.metrics.latencyMs`; si ninguno matchea, guarda null. Follow-up post-rollout: revisar payload real y ajustar.
- Volumen: Con <1k calls/día actual, agregación en TS es cero problema. Cuando cruce ~50k/día en 7d, migrar a Postgres RPC.

**Trabajo futuro (post-MVP, NO parte de este plan):**
- Alertas (pilar 5.1)
- Snapshots diarios precomputados
- Extender a chat/email/office
- Comparativa v2 vs v3 side-by-side
- Distribución de outcomes por versión

**Referencias:**
- Spec: `docs/superpowers/specs/2026-07-31-observabilidad-segmentada-design.md`
- Pilar 1 (versioning): `docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md`
- Pilar 3 (flags): `docs/superpowers/specs/2026-07-31-feature-flags-rollout-design.md`
- Pilar 4 (golden tests): `docs/superpowers/specs/2026-07-30-golden-tests-suite-design.md`
