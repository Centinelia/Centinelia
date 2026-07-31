# Feature Flags con Rollout Gradual - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar cualquier cambio de comportamiento (versión de meerkat, feature de portal, tool nueva, cambio silencioso) a un porcentaje configurable de organizaciones antes que a todas, con kill switch instantáneo y sin deploy.

**Architecture:** Nueva tabla `feature_flags` como registro central. Evaluador server-side (`isFeatureEnabled(flagKey, orgEmail)`) con precedencia `killed > denylist > allowlist > hash(orgEmail, flagKey) % 100 < rollout_pct`. Integración con pilar 1: `POST /api/admin/versiones/[meerkat]/activate` crea flag `meerkat.<id>.v<n>` en vez de mutar `meerkat_active_versions.active_version`. Resolver de versión consulta flags primero, cae a `meerkat_active_versions` como legacy fallback.

**Tech Stack:** Next.js 16.2.9 (App Router server components), TypeScript, Supabase (Postgres), Node crypto para hashing SHA-256, Lucide React iconos, ADMIN_SECRET cookie con `crypto.timingSafeEqual` para auth.

## Global Constraints

- **No em-dash `-` en copy español visible.** Sustituir con `:`, `,` o `.` (regla [[feedback_no_em_dash]]).
- **No emojis en UI.** Solo iconos de Lucide React (regla [[feedback_no_emojis]]).
- **No la palabra "IA" en copy visible.** Excepción: SEO metadata y prompts internos (regla [[feedback_no_ia_visible]]).
- **Tema-aware desde el inicio.** Todo componente admin usa `var(--c-surface)`, `var(--c-text)`, `var(--c-text-2)`, `var(--c-border)` en vez de hex colors. Verificar en light y dark mode antes de commit.
- **Admin auth idéntico a sesión 48.** Cookie `Centinelia_admin` comparada con `process.env.ADMIN_SECRET` usando `crypto.timingSafeEqual` sobre buffers del mismo tamaño (usar el patrón del archivo `src/app/api/admin/versiones/[meerkat]/activate/route.ts`).
- **Trabajar en `main`.** Sin feature branches (mismo patrón que sesiones 47 y 48). Cada task = 1 commit atómico.
- **Cache TTL evaluator = 60s.** Alineado con `resolve-meerkat.ts` (código existente usa 60s, no 30s). Consistency wins sobre spec.
- **Convención de `flag_key`:** `meerkat.<id>.v<n>` | `portal.<feature>` | `tool.<name>` | `silent.<what>`.

---

## File Structure

**Nuevos:**
- `migrations/20260731_feature_flags.sql` - schema
- `src/lib/feature-flags/types.ts` - `FlagRow`, `FlagCounts`, `EvaluatorReason`
- `src/lib/feature-flags/evaluator.ts` - `isFeatureEnabled()`, `invalidateFlagCache()`
- `src/lib/feature-flags/audit.ts` - `writeFlagAudit()`
- `src/lib/feature-flags/preview.ts` - `previewFlagAssignment(flagKey, patch)` para dry-run
- `src/lib/feature-flags/version-flag-resolver.ts` - `resolveMeerkatVersionForAgent(meerkatId, agent)`
- `src/app/api/admin/flags/route.ts` - GET list, POST create
- `src/app/api/admin/flags/[key]/route.ts` - GET detail, PATCH edit, DELETE
- `src/app/api/admin/flags/[key]/kill/route.ts` - POST kill
- `src/app/api/admin/flags/[key]/preview/route.ts` - POST dry-run
- `src/app/admin/flags/page.tsx` - lista
- `src/app/admin/flags/[key]/page.tsx` - detalle server component
- `src/components/admin/FlagEditor.tsx` - client form
- `src/components/admin/FlagsTable.tsx` - client table filtros/búsqueda
- `src/app/api/cron/flags-snapshot/route.ts` - cron diario

**Modificados:**
- `src/lib/vapi/sync.ts:368-372` - usar `resolveMeerkatVersionForAgent` antes de `resolveMeerkatConfig`
- `src/app/api/admin/versiones/[meerkat]/activate/route.ts` - reemplaza update a `meerkat_active_versions` por upsert a `feature_flags`
- `src/components/admin/VersionesTable.tsx` (o el modal separado) - agregar inputs `initial_pct` y `allowlist`
- `src/app/admin/AdminNav.tsx:5,7-22` - agregar entry "Feature flags" con icono `Flag`
- `vercel.json` - agregar cron `flags-snapshot`

**Fuera de scope de este plan (follow-ups):**
- Consumer real de flags `portal.*`, `tool.*`, `silent.*` (patrón documentado en spec, no aplicado a features específicas)
- Extensión de `admin/versiones/health` con segmentación por flag (pilar 5)
- Portal-visible opt-in

---

## Task 1: SQL Migration

**Files:**
- Create: `migrations/20260731_feature_flags.sql`

**Interfaces:**
- Produces: 3 tablas (`feature_flags`, `feature_flag_audit`, `feature_flag_daily_snapshots`) + índice `idx_flag_audit_key_time`. Consumidas por Tasks 2, 3, 4, 10.

- [ ] **Step 1: Write the migration**

Crear archivo `migrations/20260731_feature_flags.sql`:

```sql
-- Pilar 3 evolution framework: feature flags con rollout gradual
-- Ver docs/superpowers/specs/2026-07-31-feature-flags-rollout-design.md

BEGIN;

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key       TEXT PRIMARY KEY,
  description    TEXT NOT NULL,
  rollout_pct    INT  NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  allowlist      TEXT[] NOT NULL DEFAULT '{}',
  denylist       TEXT[] NOT NULL DEFAULT '{}',
  killed         BOOLEAN NOT NULL DEFAULT FALSE,
  default_on     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT
);

CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id          BIGSERIAL PRIMARY KEY,
  flag_key    TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('created','updated','killed','unkilled','deleted')),
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flag_audit_key_time ON feature_flag_audit(flag_key, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flag_daily_snapshots (
  flag_key TEXT NOT NULL,
  day      DATE NOT NULL,
  counts   JSONB NOT NULL,
  PRIMARY KEY (flag_key, day)
);

COMMIT;
```

- [ ] **Step 2: Verify SQL is syntactically valid**

Corre localmente con `psql` si tienes acceso (opcional), o inspecciona manualmente. La migration es idempotente por `IF NOT EXISTS`. Debe copiarse tal cual a Supabase Studio y correr limpio.

- [ ] **Step 3: Commit**

```powershell
git add migrations/20260731_feature_flags.sql
git commit -m @'
feat(sql): feature_flags + audit + daily_snapshots tables

Pilar 3 evolution framework. Registro central de flags con
rollout_pct, allowlist, denylist, killed, default_on. Tabla
de audit para trazabilidad admin. Tabla de snapshots diarios
para observabilidad (pilar 5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Types + Evaluator

**Files:**
- Create: `src/lib/feature-flags/types.ts`
- Create: `src/lib/feature-flags/evaluator.ts`

**Interfaces:**
- Consumes: `feature_flags` table (Task 1), `createAdminClient` de `@/lib/supabase/admin`
- Produces:
  - `type FlagRow = { flag_key, description, rollout_pct, allowlist, denylist, killed, default_on, created_at, updated_at, updated_by }`
  - `type FlagCounts = { orgs_on: number; orgs_off: number; orgs_via_hash: number; orgs_via_allowlist: number; orgs_via_denylist: number }`
  - `async function isFeatureEnabled(flagKey: string, orgEmail: string | null | undefined): Promise<boolean>`
  - `function invalidateFlagCache(): void`
  - `function hashBucket(orgEmail: string, flagKey: string): number` (exportada para tests/preview)

- [ ] **Step 1: Create types file**

Crear `src/lib/feature-flags/types.ts`:

```ts
export type FlagRow = {
  flag_key:    string;
  description: string;
  rollout_pct: number;
  allowlist:   string[];
  denylist:    string[];
  killed:      boolean;
  default_on:  boolean;
  created_at:  string;
  updated_at:  string;
  updated_by:  string | null;
};

export type FlagCounts = {
  orgs_on:            number;
  orgs_off:           number;
  orgs_via_hash:      number;
  orgs_via_allowlist: number;
  orgs_via_denylist:  number;
};

export type EvaluatorReason =
  | 'killed'
  | 'denylist'
  | 'allowlist'
  | 'hash_on'
  | 'hash_off'
  | 'default_on'
  | 'unknown_off';

export type FlagAction = 'created' | 'updated' | 'killed' | 'unkilled' | 'deleted';
```

- [ ] **Step 2: Create evaluator file**

Crear `src/lib/feature-flags/evaluator.ts`:

```ts
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FlagRow, EvaluatorReason } from './types';

// Cache in-memory con TTL 60s. Alineado con resolve-meerkat.ts.
// Prod tiene ~100 orgs, ~50 flags = trivial.
let cache: { rows: Map<string, FlagRow>; loadedAt: number } | null = null;
const TTL_MS = 60_000;

async function loadAll(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rows;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('feature_flags').select('*');
  if (error) {
    console.error('[feature-flags] load error', { error: error.message });
    // Devolver cache vieja si existe (mejor stale que 500). Sino, mapa vacío.
    return cache?.rows ?? new Map();
  }
  const rows = new Map((data ?? []).map(r => [r.flag_key, r as FlagRow]));
  cache = { rows, loadedAt: Date.now() };
  return rows;
}

export function invalidateFlagCache(): void {
  cache = null;
}

export function hashBucket(orgEmail: string, flagKey: string): number {
  const h = createHash('sha256').update(`${orgEmail}::${flagKey}`).digest();
  const n = h.readUInt32BE(0);
  return n % 100;
}

export async function isFeatureEnabled(
  flagKey: string,
  orgEmail: string | null | undefined,
): Promise<boolean> {
  const result = await evaluate(flagKey, orgEmail);
  return result.on;
}

// Version detallada para preview/dry-run y debugging.
export async function evaluate(
  flagKey: string,
  orgEmail: string | null | undefined,
): Promise<{ on: boolean; reason: EvaluatorReason }> {
  const rows = await loadAll();
  const flag = rows.get(flagKey);

  if (!flag) return { on: false, reason: 'unknown_off' };
  if (flag.killed) return { on: false, reason: 'killed' };
  if (!orgEmail) return { on: flag.default_on, reason: 'default_on' };
  if (flag.denylist.includes(orgEmail)) return { on: false, reason: 'denylist' };
  if (flag.allowlist.includes(orgEmail)) return { on: true, reason: 'allowlist' };

  const bucket = hashBucket(orgEmail, flagKey);
  const on = bucket < flag.rollout_pct;
  return { on, reason: on ? 'hash_on' : 'hash_off' };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS sin errores nuevos. Solo se agregaron archivos nuevos, no rompen nada existente.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/feature-flags/types.ts src/lib/feature-flags/evaluator.ts
git commit -m @'
feat(feature-flags): types + evaluator with killed>deny>allow>hash

Precedencia: killed gana sobre allowlist. Hash SHA-256 con
seed (org_email :: flag_key) para determinismo per (org,flag).
Cache in-memory 60s alineado con resolve-meerkat. evaluate()
devuelve razón detallada para preview/debug; isFeatureEnabled
es el wrapper booleano.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 3: Audit Helper

**Files:**
- Create: `src/lib/feature-flags/audit.ts`

**Interfaces:**
- Consumes: `feature_flag_audit` table (Task 1), `FlagRow`/`FlagAction` (Task 2)
- Produces:
  - `async function writeFlagAudit(input: { flag_key: string; actor: string; action: FlagAction; before: FlagRow | null; after: FlagRow | null }): Promise<void>`

- [ ] **Step 1: Create audit helper**

Crear `src/lib/feature-flags/audit.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { FlagRow, FlagAction } from './types';

export async function writeFlagAudit(input: {
  flag_key: string;
  actor:    string;
  action:   FlagAction;
  before:   FlagRow | null;
  after:    FlagRow | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('feature_flag_audit').insert({
    flag_key: input.flag_key,
    actor:    input.actor,
    action:   input.action,
    before:   input.before,
    after:    input.after,
  });
  if (error) {
    // Audit fail no debe bloquear la operación admin, pero sí loggear alto.
    console.error('[feature-flags] audit write failed', {
      flag_key: input.flag_key,
      action:   input.action,
      error:    error.message,
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/lib/feature-flags/audit.ts
git commit -m @'
feat(feature-flags): audit helper writeFlagAudit

Guarda before/after como JSONB. Fail no bloquea la operación
admin pero loggea alto para investigación.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: Preview Helper (dry-run)

**Files:**
- Create: `src/lib/feature-flags/preview.ts`

**Interfaces:**
- Consumes: `evaluate` (Task 2), `hashBucket` (Task 2), tabla `voice_agents` (para leer `portal_email` distinct)
- Produces:
  - `async function previewFlagAssignment(flagKey: string, patch: Partial<FlagRow>): Promise<{ counts: FlagCounts; sample_on: string[]; sample_off: string[] }>`

- [ ] **Step 1: Create preview helper**

Crear `src/lib/feature-flags/preview.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { hashBucket } from './evaluator';
import type { FlagRow, FlagCounts, EvaluatorReason } from './types';

// Dry-run: aplica `patch` sobre la fila actual (o inicial si no existe)
// y calcula qué orgs quedarían on/off. Sin persistir nada.
export async function previewFlagAssignment(
  flagKey: string,
  patch: Partial<FlagRow>,
): Promise<{ counts: FlagCounts; sample_on: string[]; sample_off: string[] }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .maybeSingle();

  const flag: FlagRow = {
    flag_key:    flagKey,
    description: '',
    rollout_pct: 0,
    allowlist:   [],
    denylist:    [],
    killed:      false,
    default_on:  false,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
    updated_by:  null,
    ...(existing as Partial<FlagRow> | null),
    ...patch,
  };

  const { data: orgs } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .not('portal_email', 'is', null);

  const uniqueEmails = Array.from(new Set((orgs ?? []).map(o => o.portal_email as string)));

  const counts: FlagCounts = { orgs_on: 0, orgs_off: 0, orgs_via_hash: 0, orgs_via_allowlist: 0, orgs_via_denylist: 0 };
  const sample_on:  string[] = [];
  const sample_off: string[] = [];

  for (const email of uniqueEmails) {
    const { on, reason } = evaluateAgainst(flag, email);
    if (on) {
      counts.orgs_on++;
      if (sample_on.length < 10) sample_on.push(email);
    } else {
      counts.orgs_off++;
      if (sample_off.length < 10) sample_off.push(email);
    }
    if (reason === 'allowlist') counts.orgs_via_allowlist++;
    if (reason === 'denylist')  counts.orgs_via_denylist++;
    if (reason === 'hash_on' || reason === 'hash_off') counts.orgs_via_hash++;
  }

  return { counts, sample_on, sample_off };
}

// Evaluator puro que opera sobre una fila dada (no cache, no DB).
function evaluateAgainst(flag: FlagRow, orgEmail: string): { on: boolean; reason: EvaluatorReason } {
  if (flag.killed) return { on: false, reason: 'killed' };
  if (flag.denylist.includes(orgEmail)) return { on: false, reason: 'denylist' };
  if (flag.allowlist.includes(orgEmail)) return { on: true, reason: 'allowlist' };
  const bucket = hashBucket(orgEmail, flag.flag_key);
  const on = bucket < flag.rollout_pct;
  return { on, reason: on ? 'hash_on' : 'hash_off' };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/lib/feature-flags/preview.ts
git commit -m @'
feat(feature-flags): preview helper for admin dry-run

Aplica un patch sobre la fila actual (o inicial), evalúa
contra todos los portal_email distinct de voice_agents, y
devuelve counts + sample de hasta 10 emails on/off.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 5: Admin API - List + Create

**Files:**
- Create: `src/app/api/admin/flags/route.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `writeFlagAudit` (Task 3), `invalidateFlagCache` (Task 2), `ADMIN_SECRET` cookie
- Produces:
  - `GET /api/admin/flags -> { flags: FlagRow[] }`
  - `POST /api/admin/flags -> { flag: FlagRow }` con body `{ flag_key, description, rollout_pct?, allowlist?, denylist?, default_on? }`

- [ ] **Step 1: Create route file**

Crear `src/app/api/admin/flags/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';

const ADMIN_ACTOR = 'admin@centinelia.mx';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const FLAG_KEY_RE = /^(meerkat|portal|tool|silent)\.[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('flag_key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    flag_key,
    description,
    rollout_pct = 0,
    allowlist = [],
    denylist = [],
    default_on = false,
  } = body as {
    flag_key?: string;
    description?: string;
    rollout_pct?: number;
    allowlist?: string[];
    denylist?: string[];
    default_on?: boolean;
  };

  if (!flag_key || typeof flag_key !== 'string' || !FLAG_KEY_RE.test(flag_key)) {
    return NextResponse.json({
      error: 'flag_key requerido con formato <scope>.<subject>[.<variant>] donde scope in (meerkat, portal, tool, silent)',
    }, { status: 400 });
  }
  if (!description || typeof description !== 'string') {
    return NextResponse.json({ error: 'description requerida' }, { status: 400 });
  }
  if (typeof rollout_pct !== 'number' || rollout_pct < 0 || rollout_pct > 100) {
    return NextResponse.json({ error: 'rollout_pct debe estar entre 0 y 100' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('feature_flags')
    .select('flag_key')
    .eq('flag_key', flag_key)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `flag_key ya existe: ${flag_key}` }, { status: 409 });
  }

  const row = {
    flag_key,
    description,
    rollout_pct,
    allowlist,
    denylist,
    default_on,
    killed:     false,
    updated_by: ADMIN_ACTOR,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from('feature_flags')
    .insert(row)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({
    flag_key,
    actor:  ADMIN_ACTOR,
    action: 'created',
    before: null,
    after:  inserted,
  });

  invalidateFlagCache();
  return NextResponse.json({ flag: inserted }, { status: 201 });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/admin/flags/route.ts
git commit -m @'
feat(api): GET+POST /api/admin/flags with timing-safe auth

Regex de flag_key exige prefijo meerkat|portal|tool|silent.
Insert valida no duplicado, escribe audit action=created e
invalida cache del evaluator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Admin API - Detail, Edit, Delete, Kill, Preview

**Files:**
- Create: `src/app/api/admin/flags/[key]/route.ts`
- Create: `src/app/api/admin/flags/[key]/kill/route.ts`
- Create: `src/app/api/admin/flags/[key]/preview/route.ts`

**Interfaces:**
- Consumes: Task 3 audit, Task 2 cache invalidation, Task 4 preview
- Produces:
  - `GET /api/admin/flags/[key] -> { flag: FlagRow; audit: AuditRow[] }` (últimas 20 filas de audit)
  - `PATCH /api/admin/flags/[key] -> { flag: FlagRow }`
  - `DELETE /api/admin/flags/[key] -> { ok: true }`
  - `POST /api/admin/flags/[key]/kill -> { flag: FlagRow }` body `{ unkill?: boolean }`
  - `POST /api/admin/flags/[key]/preview -> { counts, sample_on, sample_off }` body `Partial<FlagRow>`

- [ ] **Step 1: Create `[key]/route.ts` (GET, PATCH, DELETE)**

Crear `src/app/api/admin/flags/[key]/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';
import type { FlagRow } from '@/lib/feature-flags/types';

const ADMIN_ACTOR = 'admin@centinelia.mx';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Params { params: Promise<{ key: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const supabase = createAdminClient();

  const { data: flag } = await supabase.from('feature_flags').select('*').eq('flag_key', key).maybeSingle();
  if (!flag) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: audit } = await supabase
    .from('feature_flag_audit')
    .select('*')
    .eq('flag_key', key)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ flag, audit: audit ?? [] });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const body = await req.json().catch(() => ({})) as Partial<FlagRow>;
  const supabase = createAdminClient();

  const { data: before } = await supabase.from('feature_flags').select('*').eq('flag_key', key).maybeSingle();
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Solo permitimos editar estos campos por PATCH. flag_key es inmutable.
  // killed se maneja por endpoint dedicado /kill para claridad de audit.
  const patch: Partial<FlagRow> = {
    updated_by: ADMIN_ACTOR,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.rollout_pct === 'number' && body.rollout_pct >= 0 && body.rollout_pct <= 100) patch.rollout_pct = body.rollout_pct;
  if (Array.isArray(body.allowlist))  patch.allowlist  = body.allowlist.map(String);
  if (Array.isArray(body.denylist))   patch.denylist   = body.denylist.map(String);
  if (typeof body.default_on === 'boolean') patch.default_on = body.default_on;

  const { data: after, error } = await supabase
    .from('feature_flags')
    .update(patch)
    .eq('flag_key', key)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({ flag_key: key, actor: ADMIN_ACTOR, action: 'updated', before, after });
  invalidateFlagCache();
  return NextResponse.json({ flag: after });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const supabase = createAdminClient();

  const { data: before } = await supabase.from('feature_flags').select('*').eq('flag_key', key).maybeSingle();
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { error } = await supabase.from('feature_flags').delete().eq('flag_key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({ flag_key: key, actor: ADMIN_ACTOR, action: 'deleted', before, after: null });
  invalidateFlagCache();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create `[key]/kill/route.ts`**

Crear `src/app/api/admin/flags/[key]/kill/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';

const ADMIN_ACTOR = 'admin@centinelia.mx';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Params { params: Promise<{ key: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const body = await req.json().catch(() => ({})) as { unkill?: boolean };
  const targetKilled = !body.unkill;

  const supabase = createAdminClient();
  const { data: before } = await supabase.from('feature_flags').select('*').eq('flag_key', key).maybeSingle();
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (before.killed === targetKilled) {
    return NextResponse.json({ flag: before, noop: true });
  }

  const { data: after, error } = await supabase
    .from('feature_flags')
    .update({ killed: targetKilled, updated_by: ADMIN_ACTOR, updated_at: new Date().toISOString() })
    .eq('flag_key', key)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeFlagAudit({
    flag_key: key,
    actor:    ADMIN_ACTOR,
    action:   targetKilled ? 'killed' : 'unkilled',
    before,
    after,
  });
  invalidateFlagCache();
  return NextResponse.json({ flag: after });
}
```

- [ ] **Step 3: Create `[key]/preview/route.ts`**

Crear `src/app/api/admin/flags/[key]/preview/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { previewFlagAssignment } from '@/lib/feature-flags/preview';
import type { FlagRow } from '@/lib/feature-flags/types';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  const expected = process.env.ADMIN_SECRET;
  if (!secret || !expected) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Params { params: Promise<{ key: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { key } = await params;
  const patch = await req.json().catch(() => ({})) as Partial<FlagRow>;
  const result = await previewFlagAssignment(key, patch);
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/admin/flags/[key]/route.ts src/app/api/admin/flags/[key]/kill/route.ts src/app/api/admin/flags/[key]/preview/route.ts
git commit -m @'
feat(api): flag detail, edit, delete, kill, preview

PATCH permite editar description, rollout_pct, allowlist,
denylist, default_on. flag_key inmutable. killed va por
endpoint dedicado con audit action killed|unkilled. Preview
POST devuelve counts + sample_on/off (10 emails cada uno).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 7: AdminNav Entry

**Files:**
- Modify: `src/app/admin/AdminNav.tsx:5,7-22`

**Interfaces:**
- Consumes: nada nuevo. Solo agrega link.
- Produces: entry visible "Feature flags" en el nav admin.

- [ ] **Step 1: Agregar Flag al import de lucide-react**

Editar `src/app/admin/AdminNav.tsx` línea 5. Cambiar:

```ts
import { LayoutDashboard, Bot, BarChart3, Plus, CreditCard, FileText, Users, Settings, Phone, Sparkles, Home, Terminal, DollarSign, ShieldCheck, Server, GitBranch, FlaskConical } from 'lucide-react';
```

Por:

```ts
import { LayoutDashboard, Bot, BarChart3, Plus, CreditCard, FileText, Users, Settings, Phone, Sparkles, Home, Terminal, DollarSign, ShieldCheck, Server, GitBranch, FlaskConical, Flag } from 'lucide-react';
```

- [ ] **Step 2: Agregar entry al array `links`**

Editar el array `links` (líneas 7-22). Insertar después de la entry "Golden tests":

```ts
{ href: '/admin/flags',        icon: Flag,            label: 'Feature flags' },
```

Resultado final del bloque:

```ts
const links = [
  { href: '/admin/inicio',       icon: Home,            label: 'Inicio' },
  { href: '/admin/comando',      icon: Terminal,        label: 'Comando' },
  { href: '/admin/ledger',       icon: DollarSign,      label: 'Ledger' },
  { href: '/admin/aprobaciones', icon: ShieldCheck,     label: 'Aprobaciones' },
  { href: '/admin/clientes',     icon: Users,           label: 'Clientes' },
  { href: '/admin/agentes',      icon: Bot,             label: 'Empleados' },
  { href: '/admin/llamadas',     icon: Phone,           label: 'Llamadas' },
  { href: '/admin/analytics',    icon: BarChart3,       label: 'Analytics' },
  { href: '/admin/billing',      icon: CreditCard,      label: 'Facturación' },
  { href: '/admin/contratos',    icon: FileText,        label: 'Contratos' },
  { href: '/admin/conversacional', icon: Sparkles,      label: 'Estilo conv.' },
  { href: '/admin/dashboard',    icon: Server,          label: 'Infra' },
  { href: '/admin/versiones',    icon: GitBranch,       label: 'Versiones' },
  { href: '/admin/versiones/health', icon: FlaskConical, label: 'Golden tests' },
  { href: '/admin/flags',        icon: Flag,            label: 'Feature flags' },
];
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add src/app/admin/AdminNav.tsx
git commit -m @'
feat(admin): AdminNav entry Feature flags

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 8: Admin UI - List Page + Table

**Files:**
- Create: `src/app/admin/flags/page.tsx`
- Create: `src/components/admin/FlagsTable.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/flags` (Task 5), ADMIN_SECRET cookie
- Produces: página `/admin/flags` con lista filtrable por prefijo y buscador texto.

- [ ] **Step 1: Create server page**

Crear `src/app/admin/flags/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { FlagsTable } from '@/components/admin/FlagsTable';
import type { FlagRow } from '@/lib/feature-flags/types';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function FlagsPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('feature_flags')
    .select('*')
    .order('flag_key');

  const flags = (data ?? []) as FlagRow[];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Feature flags</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Rollout gradual por organización. Precedencia: killed, denylist, allowlist, hash.
          </p>
        </div>
      </div>

      <FlagsTable initialFlags={flags} />
    </div>
  );
}
```

- [ ] **Step 2: Create FlagsTable client component**

Crear `src/components/admin/FlagsTable.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Ban } from 'lucide-react';
import type { FlagRow } from '@/lib/feature-flags/types';

type Prefix = 'all' | 'meerkat' | 'portal' | 'tool' | 'silent';

export function FlagsTable({ initialFlags }: { initialFlags: FlagRow[] }) {
  const [prefix, setPrefix] = useState<Prefix>('all');
  const [onlyKilled, setOnlyKilled] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return initialFlags.filter(f => {
      if (onlyKilled && !f.killed) return false;
      if (prefix !== 'all' && !f.flag_key.startsWith(prefix + '.')) return false;
      if (query && !f.flag_key.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [initialFlags, prefix, onlyKilled, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'meerkat', 'portal', 'tool', 'silent'] as Prefix[]).map(p => (
          <button
            key={p}
            onClick={() => setPrefix(p)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: prefix === p ? 'rgba(108,59,255,0.15)' : 'var(--c-surface-2)',
              color:      prefix === p ? '#9B6DFF' : 'var(--c-text-2)',
              border:     '1px solid var(--c-border)',
            }}
          >
            {p === 'all' ? 'Todos' : p}
          </button>
        ))}
        <button
          onClick={() => setOnlyKilled(v => !v)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
          style={{
            background: onlyKilled ? 'rgba(220,38,38,0.15)' : 'var(--c-surface-2)',
            color:      onlyKilled ? '#DC2626' : 'var(--c-text-2)',
            border:     '1px solid var(--c-border)',
          }}
        >
          <Ban size={14} />
          Solo killed
        </button>
        <div className="flex-1 relative min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-2)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por flag_key"
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-sm"
            style={{
              background: 'var(--c-surface-2)',
              color:      'var(--c-text)',
              border:     '1px solid var(--c-border)',
            }}
          />
        </div>
        <Link
          href="/admin/flags/new"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Plus size={14} />
          Nuevo flag
        </Link>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--c-surface-2)' }}>
            <tr>
              <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>flag_key</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>%</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>allow</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>deny</th>
              <th className="text-center px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>estado</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--c-text-2)' }}>actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center px-4 py-8" style={{ color: 'var(--c-text-2)' }}>
                  Sin flags que coincidan.
                </td>
              </tr>
            )}
            {filtered.map(f => (
              <tr key={f.flag_key} style={{ borderTop: '1px solid var(--c-border)' }}>
                <td className="px-4 py-2">
                  <Link href={`/admin/flags/${encodeURIComponent(f.flag_key)}`} style={{ color: '#9B6DFF' }}>
                    {f.flag_key}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--c-text)' }}>{f.rollout_pct}</td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--c-text-2)' }}>{f.allowlist.length}</td>
                <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--c-text-2)' }}>{f.denylist.length}</td>
                <td className="px-4 py-2 text-center">
                  {f.killed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}>
                      <Ban size={12} /> KILLED
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--c-text-2)' }}>activo</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-xs" style={{ color: 'var(--c-text-2)' }}>
                  {timeAgo(f.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)     return `hace ${s}s`;
  if (s < 3600)   return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400)  return `hace ${Math.floor(s / 3600)}h`;
  return `hace ${Math.floor(s / 86400)}d`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Smoke test**

Corre `npm run dev`, entra a `http://localhost:3000/admin/flags` con la cookie admin. Debes ver:
- Título "Feature flags"
- Filtros por prefijo
- Tabla vacía con mensaje "Sin flags que coincidan"
- Botón "Nuevo flag" que apunta a `/admin/flags/new`

Verifica que se ve bien en light y dark mode (toggle el tema si aplica).

- [ ] **Step 5: Commit**

```powershell
git add src/app/admin/flags/page.tsx src/components/admin/FlagsTable.tsx
git commit -m @'
feat(admin): flags list page with filters + search

Server component fetch inicial; client component maneja
filtros por prefijo (meerkat/portal/tool/silent), toggle
solo-killed, buscador texto. Tema-aware con var(--c-*).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 9: Admin UI - Detail Page + Editor

**Files:**
- Create: `src/app/admin/flags/[key]/page.tsx`
- Create: `src/app/admin/flags/new/page.tsx`
- Create: `src/components/admin/FlagEditor.tsx`

**Interfaces:**
- Consumes: `GET/PATCH/DELETE/POST /api/admin/flags/[key]/*` (Tasks 5, 6)
- Produces: páginas `/admin/flags/[key]` y `/admin/flags/new` con formulario funcional.

- [ ] **Step 1: Create detail page (server component)**

Crear `src/app/admin/flags/[key]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { FlagEditor } from '@/components/admin/FlagEditor';
import type { FlagRow } from '@/lib/feature-flags/types';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

type AuditRow = {
  id:         number;
  actor:      string;
  action:     string;
  before:     unknown;
  after:      unknown;
  created_at: string;
};

interface Params { params: Promise<{ key: string }> }

export default async function FlagDetailPage({ params }: Params) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { key } = await params;
  const decoded = decodeURIComponent(key);

  const supabase = createAdminClient();
  const { data: flag } = await supabase.from('feature_flags').select('*').eq('flag_key', decoded).maybeSingle();
  if (!flag) notFound();

  const { data: audit } = await supabase
    .from('feature_flag_audit')
    .select('id, actor, action, before, after, created_at')
    .eq('flag_key', decoded)
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/admin/flags" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--c-text-2)' }}>
        <ArrowLeft size={14} /> Todos los flags
      </Link>

      <FlagEditor flag={flag as FlagRow} mode="edit" />

      <div>
        <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--c-text)' }}>Historial (últimas 20)</h2>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: 'var(--c-surface-2)' }}>
              <tr>
                <th className="text-left px-3 py-2" style={{ color: 'var(--c-text-2)' }}>fecha</th>
                <th className="text-left px-3 py-2" style={{ color: 'var(--c-text-2)' }}>actor</th>
                <th className="text-left px-3 py-2" style={{ color: 'var(--c-text-2)' }}>acción</th>
              </tr>
            </thead>
            <tbody>
              {(audit as AuditRow[] ?? []).length === 0 && (
                <tr><td colSpan={3} className="text-center px-3 py-4" style={{ color: 'var(--c-text-2)' }}>Sin cambios registrados.</td></tr>
              )}
              {(audit as AuditRow[] ?? []).map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--c-text-2)' }}>{new Date(a.created_at).toLocaleString('es-MX')}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{a.actor}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: 'var(--c-text)' }}>{a.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create new-flag page**

Crear `src/app/admin/flags/new/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FlagEditor } from '@/components/admin/FlagEditor';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function NewFlagPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link href="/admin/flags" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--c-text-2)' }}>
        <ArrowLeft size={14} /> Todos los flags
      </Link>
      <FlagEditor mode="create" />
    </div>
  );
}
```

- [ ] **Step 3: Create FlagEditor client component**

Crear `src/components/admin/FlagEditor.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Ban, PlayCircle, Save, Trash2, Eye } from 'lucide-react';
import type { FlagRow, FlagCounts } from '@/lib/feature-flags/types';

type Mode = 'create' | 'edit';

export function FlagEditor({ flag, mode }: { flag?: FlagRow; mode: Mode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [flagKey,     setFlagKey]     = useState(flag?.flag_key    ?? '');
  const [description, setDescription] = useState(flag?.description ?? '');
  const [rolloutPct,  setRolloutPct]  = useState(flag?.rollout_pct ?? 0);
  const [allowlist,   setAllowlist]   = useState((flag?.allowlist  ?? []).join('\n'));
  const [denylist,    setDenylist]    = useState((flag?.denylist   ?? []).join('\n'));
  const [defaultOn,   setDefaultOn]   = useState(flag?.default_on  ?? false);
  const [preview,     setPreview]     = useState<{ counts: FlagCounts; sample_on: string[]; sample_off: string[] } | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const parseList = (text: string): string[] =>
    text.split('\n').map(s => s.trim()).filter(Boolean);

  const buildPatch = () => ({
    flag_key:    flagKey.trim(),
    description: description.trim(),
    rollout_pct: rolloutPct,
    allowlist:   parseList(allowlist),
    denylist:    parseList(denylist),
    default_on:  defaultOn,
  });

  const onPreview = () => {
    if (mode === 'create') { setError('Guarda el flag antes de hacer preview.'); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(flagKey)}/preview`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(buildPatch()),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error en preview'); return; }
      setPreview(json);
    });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const url = mode === 'create'
        ? '/api/admin/flags'
        : `/api/admin/flags/${encodeURIComponent(flagKey)}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(buildPatch()),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error al guardar'); return; }
      if (mode === 'create') {
        router.push(`/admin/flags/${encodeURIComponent(flagKey)}`);
      } else {
        router.refresh();
      }
    });
  };

  const onToggleKill = (unkill: boolean) => {
    startTransition(async () => {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(flagKey)}/kill`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ unkill }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Error al cambiar killed'); return; }
      router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm(`Borrar flag ${flagKey}. Esta acción se registra pero no se puede deshacer. ¿Continuar?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(flagKey)}`, { method: 'DELETE' });
      if (res.ok) router.push('/admin/flags');
      else {
        const json = await res.json();
        setError(json.error ?? 'Error al borrar');
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg p-6" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>flag_key</label>
          <input
            type="text"
            value={flagKey}
            onChange={e => setFlagKey(e.target.value)}
            disabled={mode === 'edit'}
            placeholder="meerkat.nia.v2"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{
              background: mode === 'edit' ? 'var(--c-surface-2)' : 'var(--c-surface)',
              color:      'var(--c-text)',
              border:     '1px solid var(--c-border)',
            }}
          />
        </div>
        {mode === 'edit' && flag && (
          <div className="flex gap-2">
            {flag.killed ? (
              <button
                onClick={() => onToggleKill(true)}
                disabled={pending}
                className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#16A34A' }}
              >
                <PlayCircle size={14} /> Un-kill
              </button>
            ) : (
              <button
                onClick={() => onToggleKill(false)}
                disabled={pending}
                className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
                style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626' }}
              >
                <Ban size={14} /> Kill
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={pending}
              className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            >
              <Trash2 size={14} /> Borrar
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Descripción</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Rollout v2 de nia"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
          rollout_pct: <span className="font-mono">{rolloutPct}</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={rolloutPct}
          onChange={e => setRolloutPct(parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Allowlist (portal_email por línea)</label>
          <textarea
            value={allowlist}
            onChange={e => setAllowlist(e.target.value)}
            rows={5}
            placeholder="nazre@gmail.com&#10;sergio@example.com"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Denylist (portal_email por línea)</label>
          <textarea
            value={denylist}
            onChange={e => setDenylist(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text)' }}>
        <input type="checkbox" checked={defaultOn} onChange={e => setDefaultOn(e.target.checked)} />
        default_on (usar cuando no hay org email, ej. webhook anónimo)
      </label>

      {error && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)' }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={onPreview}
          disabled={pending || mode === 'create'}
          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'var(--c-surface-2)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
        >
          <Eye size={14} /> Preview (dry-run)
        </button>
        <button
          onClick={onSave}
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Save size={14} /> Guardar
        </button>
      </div>

      {preview && (
        <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            Preview: {preview.counts.orgs_on} on, {preview.counts.orgs_off} off
          </div>
          <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
            via hash: {preview.counts.orgs_via_hash}, via allowlist: {preview.counts.orgs_via_allowlist}, via denylist: {preview.counts.orgs_via_denylist}
          </div>
          {preview.sample_on.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              Sample on: <span className="font-mono">{preview.sample_on.join(', ')}</span>
            </div>
          )}
          {preview.sample_off.length > 0 && (
            <div className="text-xs" style={{ color: 'var(--c-text-2)' }}>
              Sample off: <span className="font-mono">{preview.sample_off.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Smoke test end-to-end**

1. Corre migration en Supabase Studio (Task 1). Sin este paso los siguientes fallan.
2. `npm run dev`
3. Ve a `/admin/flags`. Vacío.
4. Click "Nuevo flag". Llena `flag_key = tool.smoke_test`, `description = smoke`, `rollout_pct = 25`. Guarda.
5. Redirige a `/admin/flags/tool.smoke_test`. Verifica que la fila aparece con audit "created".
6. Cambia `rollout_pct` a 50. Guarda. Historial ahora tiene "updated".
7. Click "Preview". Debe mostrar contra los ~100 orgs qué queda on/off.
8. Click "Kill". Estado cambia a KILLED. Historial suma "killed".
9. Click "Un-kill". Estado vuelve a activo. Historial suma "unkilled".
10. Click "Borrar". Confirma. Redirige a `/admin/flags`. La fila desapareció. Fila de audit "deleted" quedó en DB (verificar con `SELECT * FROM feature_flag_audit WHERE flag_key='tool.smoke_test'` - deben existir las 4 filas).
11. Verifica que se ve OK en light y dark mode.

- [ ] **Step 6: Commit**

```powershell
git add src/app/admin/flags/[key]/page.tsx src/app/admin/flags/new/page.tsx src/components/admin/FlagEditor.tsx
git commit -m @'
feat(admin): flag detail + editor with preview + kill + audit log

Editor client component maneja create/edit/kill/unkill/delete
+ preview dry-run. Detail page server component muestra
formulario + tabla de historial (últimas 20 filas de audit).
Tema-aware.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 10: Version Flag Resolver

**Files:**
- Create: `src/lib/feature-flags/version-flag-resolver.ts`

**Interfaces:**
- Consumes: `MEERKAT_CONFIGS` de `@/lib/vapi/meerkat-configs`, `getActiveVersion` de `@/lib/vapi/resolve-meerkat`, `isFeatureEnabled` (Task 2)
- Produces:
  - `async function resolveMeerkatVersionForAgent(meerkatId: string, agent: { portal_email: string | null; features: { pinned_meerkat_version?: number | null } }): Promise<number>`

**Contexto:**
Este helper compone flag lookup + pin lookup + fallback legacy. Se llama ANTES de `resolveMeerkatConfig()`. Preserva la firma actual de `resolveMeerkatConfig` para no romper el golden test runner (que llama con versión explícita).

Precedencia:
1. `agent.features.pinned_meerkat_version` (override manual per-agent) → gana sobre todo
2. Flag `meerkat.<id>.v<n>` on para este `portal_email`, buscado de la versión más alta a la más baja del bundle
3. Fallback: `getActiveVersion(meerkatId)` de `meerkat_active_versions` (legacy)

- [ ] **Step 1: Create resolver**

Crear `src/lib/feature-flags/version-flag-resolver.ts`:

```ts
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { getActiveVersion } from '@/lib/vapi/resolve-meerkat';
import { isFeatureEnabled } from './evaluator';

type AgentSlice = {
  portal_email: string | null;
  features: {
    pinned_meerkat_version?: number | null;
    [k: string]: unknown;
  };
};

export async function resolveMeerkatVersionForAgent(
  meerkatId: string,
  agent: AgentSlice,
): Promise<number> {
  const versions = MEERKAT_CONFIGS[meerkatId];
  if (!versions) return 1;

  // 1. Pin per-agent gana sobre todo
  const pinned = agent.features?.pinned_meerkat_version;
  if (typeof pinned === 'number' && versions[pinned]) {
    return pinned;
  }

  // 2. Flags meerkat.<id>.v<n> de la versión más alta a la más baja
  const versionNumbers = Object.keys(versions).map(Number).sort((a, b) => b - a);
  for (const v of versionNumbers) {
    const flagKey = `meerkat.${meerkatId}.v${v}`;
    const on = await isFeatureEnabled(flagKey, agent.portal_email);
    if (on) return v;
  }

  // 3. Legacy fallback: active version de meerkat_active_versions
  return await getActiveVersion(meerkatId);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```powershell
git add src/lib/feature-flags/version-flag-resolver.ts
git commit -m @'
feat(feature-flags): resolveMeerkatVersionForAgent

Compone pin per-agent, flags meerkat.<id>.v<n>, fallback
legacy a meerkat_active_versions. Sin cambio de firma en
resolveMeerkatConfig (golden test runner intacto).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 11: Integrate Resolver into sync.ts

**Files:**
- Modify: `src/lib/vapi/sync.ts:368-372`

**Interfaces:**
- Consumes: `resolveMeerkatVersionForAgent` (Task 10)
- Produces: nada nuevo. Ahora sync.ts usa flags para elegir la versión antes de pedir el config.

- [ ] **Step 1: Add import**

Editar `src/lib/vapi/sync.ts` línea 6 (o donde tenga sentido, cerca del import de resolveMeerkatConfig). Agregar:

```ts
import { resolveMeerkatVersionForAgent } from '@/lib/feature-flags/version-flag-resolver';
```

- [ ] **Step 2: Replace the resolveMeerkatConfig call**

Editar `src/lib/vapi/sync.ts:368-372`. Reemplazar:

```ts
const meerkatId = agent.features.meerkat_role_id;
const cfg: MeerkatModelConfig = await resolveMeerkatConfig(
  meerkatId ?? '',
  agent.features.pinned_meerkat_version ?? null,
);
```

Por:

```ts
const meerkatId = agent.features.meerkat_role_id;
// Primero resolvemos la versión (aplicando flags + pin + legacy fallback),
// luego pedimos el config. Esto mete pilar 3 sin cambiar la firma de
// resolveMeerkatConfig (usada también por golden tests con versión explícita).
const version = meerkatId
  ? await resolveMeerkatVersionForAgent(meerkatId, {
      portal_email: agent.portal_email ?? null,
      features: agent.features,
    })
  : null;
const cfg: MeerkatModelConfig = await resolveMeerkatConfig(meerkatId ?? '', version);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Smoke test - regression**

Sin crear ningún flag, invoca un sync de un agente conocido. La resolución debe caer al legacy fallback (`getActiveVersion`) y devolver la versión que ya estaba activa. Es decir: **cero cambio de comportamiento sin flags**.

Corre manualmente:
```powershell
$env:VAPI_SECRET = (Select-String -Path .env.local -Pattern '^VAPI_SERVER_SECRET=' | ForEach-Object { $_.Line -replace '^VAPI_SERVER_SECRET=','' -replace '"','' })
# Trigger sync de un agent de test (usa el UI de /admin/agentes/[id] para "Sync now" si existe)
```

O más simple: haz una llamada real al número demo. Si contesta con la misma personalidad de antes, el fallback funciona.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/vapi/sync.ts
git commit -m @'
feat(vapi): sync usa version-flag-resolver antes de config

Sin flags creados aún, cae al legacy fallback (getActiveVersion)
y devuelve la misma versión que hoy. Cero cambio de
comportamiento hasta que se cree el primer flag
meerkat.<id>.v<n>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 12: Refactor Activate Route to Create Flags

**Files:**
- Modify: `src/app/api/admin/versiones/[meerkat]/activate/route.ts`

**Interfaces:**
- Consumes: `writeFlagAudit`, `invalidateFlagCache`, `createAdminClient`
- Produces: comportamiento cambia. Ahora activar crea/upserta un flag `meerkat.<id>.v<n>` en vez de mutar `meerkat_active_versions`.

**Nota crítica:**
El body de la request ahora acepta 2 campos opcionales nuevos: `initial_pct` (default 10) y `allowlist` (default `[]`). El gate verdict de golden tests sigue calculándose server-side idéntico. `meerkat_version_history` sigue registrándose igual (para preservar el UI actual de historial de versiones). Lo que **cambia** es que ya no se hace `UPDATE meerkat_active_versions SET active_version=...`; en su lugar se upserta la fila del flag.

- [ ] **Step 1: Modify the activate route**

Editar `src/app/api/admin/versiones/[meerkat]/activate/route.ts`. Reemplaza el archivo completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';
import { resyncAgentsByMeerkat } from '@/lib/vapi/resync-meerkat';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { computeGateVerdict } from '@/lib/golden-tests/gate';
import { invalidateFlagCache } from '@/lib/feature-flags/evaluator';
import { writeFlagAudit } from '@/lib/feature-flags/audit';

async function currentAdminEmail(): Promise<{ ok: boolean; email?: string }> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  if (secret !== process.env.ADMIN_SECRET) return { ok: false };
  return { ok: true, email: 'admin@centinelia.mx' };
}

interface Params { params: Promise<{ meerkat: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await currentAdminEmail();
  if (!auth.ok || !auth.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const body = await req.json().catch(() => ({}));
  const {
    version,
    reason,
    override_reason,
    initial_pct: initialPctRaw,
    allowlist: allowlistRaw,
    gate_verdict: client_gate_verdict,
  } = body as {
    version?: number;
    reason?: string;
    override_reason?: string;
    initial_pct?: number;
    allowlist?: string[];
    gate_verdict?: string;
  };

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
  }

  const versionsInCode = MEERKAT_CONFIGS[meerkat];
  if (!versionsInCode) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!versionsInCode[version]) {
    return NextResponse.json({
      error: `Version ${version} does not exist in code for ${meerkat}. Available: ${Object.keys(versionsInCode).join(', ')}`,
    }, { status: 400 });
  }

  const initialPct = typeof initialPctRaw === 'number' && initialPctRaw >= 0 && initialPctRaw <= 100
    ? Math.round(initialPctRaw)
    : 10;
  const allowlist = Array.isArray(allowlistRaw) ? allowlistRaw.map(String) : [];

  const supabase = createAdminClient();

  // Read current active version para history from_version (mantener continuidad con UI actual).
  const { data: current } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkat)
    .maybeSingle();
  const currentVersion = current?.active_version ?? null;

  if (currentVersion === version) {
    return NextResponse.json({ ok: true, noop: true, message: `Already active on v${version}` });
  }

  // Gate verdict SERVER-SIDE (client_gate_verdict solo informativo).
  let serverVerdict: string = 'incomplete';
  if (MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    try {
      const gateResult = await computeGateVerdict(meerkat as MeerkatId, version);
      serverVerdict = gateResult.verdict;
      if (client_gate_verdict && client_gate_verdict !== serverVerdict) {
        console.warn('[activate] client_gate_verdict diverges from server', { meerkat, version, client: client_gate_verdict, server: serverVerdict });
      }
    } catch (e) {
      console.error('[activate] computeGateVerdict failed', { meerkat, version, error: (e as Error).message });
    }
  }

  if ((serverVerdict === 'fail' || serverVerdict === 'incomplete') && !override_reason?.trim()) {
    return NextResponse.json({
      error: `override_reason is required when gate_verdict is '${serverVerdict}'`,
      gate_verdict: serverVerdict,
    }, { status: 400 });
  }

  const finalReason = reason ?? (currentVersion != null && version < currentVersion ? 'rollback' : 'rollout');
  const historyReason = override_reason?.trim()
    ? `[OVERRIDE:${serverVerdict}] ${override_reason.trim()}${reason ? ` - ${reason}` : ''}`
    : (reason ?? finalReason);

  // 1. History record (mantiene UI actual de historial de versiones).
  const { error: histErr } = await supabase.from('meerkat_version_history').insert({
    meerkat_id:   meerkat,
    from_version: currentVersion,
    to_version:   version,
    changed_by:   auth.email,
    reason:       historyReason,
  });
  if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 });

  // 2. Upsert flag meerkat.<id>.v<n>. Esto ES ahora la fuente de verdad de rollout.
  const flagKey = `meerkat.${meerkat}.v${version}`;
  const description = `Rollout v${version} de ${meerkat}${reason ? `: ${reason}` : ''}`;

  const { data: beforeFlag } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .maybeSingle();

  const { data: afterFlag, error: flagErr } = await supabase
    .from('feature_flags')
    .upsert({
      flag_key:    flagKey,
      description,
      rollout_pct: initialPct,
      allowlist,
      denylist:    [],
      killed:      false,
      default_on:  false,
      updated_by:  auth.email,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'flag_key' })
    .select('*')
    .single();

  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 });

  await writeFlagAudit({
    flag_key: flagKey,
    actor:    auth.email,
    action:   beforeFlag ? 'updated' : 'created',
    before:   beforeFlag,
    after:    afterFlag,
  });

  // Invalidar caches locales de esta instancia. Otras instancias esperan sus TTL.
  clearMeerkatVersionCache();
  invalidateFlagCache();

  // Fire-and-forget resync a Vapi. No bloquea la response.
  resyncAgentsByMeerkat(meerkat).then(result => {
    console.log('[activate] resync complete', { meerkat, version, ...result });
  }).catch((err: Error) => {
    console.error('[activate] resync failed', { meerkat, version, error: err.message });
  });

  return NextResponse.json({
    ok: true,
    meerkat,
    from_version: currentVersion,
    to_version:   version,
    reason:       finalReason,
    gate_verdict: serverVerdict,
    flag_key:     flagKey,
    rollout_pct:  initialPct,
    message:      `${meerkat} v${version} activated as flag ${flagKey} at ${initialPct}%. Resync in progress.`,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Smoke test - no-op path**

Sin agregar una versión nueva, corre POST al mismo `active_version` actual:
```
POST /api/admin/versiones/nia/activate
{ "version": 1 }
```
Expected: `{ ok: true, noop: true, ... }` sin crear flag.

- [ ] **Step 4: Commit**

```powershell
git add src/app/api/admin/versiones/[meerkat]/activate/route.ts
git commit -m @'
feat(admin): activate crea flag meerkat.<id>.v<n>

En vez de mutar meerkat_active_versions.active_version, ahora
upserta feature_flags con rollout_pct=initial_pct (default 10)
y allowlist opcional. meerkat_version_history sigue registrado
para preservar el UI de historial. Gate verdict server-side
sigue igual. Cero cambio a UI hasta task 13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 13: ActivateVersionModal UI - initial_pct + allowlist

**Files:**
- Modify: `src/components/admin/ActivateVersionModal.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/versiones/[meerkat]/activate` con los 2 campos nuevos
- Produces: modal ahora acepta slider inicial_pct y textarea allowlist.

- [ ] **Step 1: Leer el modal actual**

Léelo con Read: `src/components/admin/ActivateVersionModal.tsx`. Identifica dónde están los inputs de `reason` y `override_reason`, y dónde está el fetch a `/api/admin/versiones/${meerkat}/activate`.

- [ ] **Step 2: Agregar los 2 inputs al form del modal**

Agregar en el estado del componente:

```tsx
const [initialPct, setInitialPct] = useState<number>(10);
const [allowlistText, setAllowlistText] = useState<string>('nazre@gmail.com');
```

Agregar en el JSX del modal, junto a los inputs existentes (reason, override_reason):

```tsx
<div className="space-y-1">
  <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
    Rollout inicial: <span className="font-mono">{initialPct}%</span>
  </label>
  <input
    type="range"
    min={0}
    max={100}
    step={5}
    value={initialPct}
    onChange={e => setInitialPct(parseInt(e.target.value, 10))}
    className="w-full"
  />
  <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
    Después puedes subirlo desde /admin/flags cuando estés a gusto.
  </p>
</div>

<div className="space-y-1">
  <label className="block text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Allowlist (portal_email por línea)</label>
  <textarea
    value={allowlistText}
    onChange={e => setAllowlistText(e.target.value)}
    rows={3}
    className="w-full px-3 py-2 rounded-lg text-sm font-mono"
    style={{ background: 'var(--c-surface)', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}
  />
  <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
    Estas orgs siempre reciben la nueva versión aunque el hash caiga off. Útil para dogfooding.
  </p>
</div>
```

Modificar el fetch/POST del modal para enviar los 2 campos nuevos:

```tsx
const res = await fetch(`/api/admin/versiones/${meerkat}/activate`, {
  method:  'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    version,
    reason,
    override_reason: overrideReason || undefined,
    initial_pct: initialPct,
    allowlist: allowlistText.split('\n').map(s => s.trim()).filter(Boolean),
  }),
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Smoke test**

1. Ve a `/admin/versiones` en dev
2. Agrega un `NIA_CONFIGS[2] = { ... copy of v1 ... }` temporalmente en `src/lib/vapi/meerkat-configs.ts` (revierte antes de commit)
3. Abre el modal para activar nia v2. Verifica los 2 inputs nuevos: slider en 10, textarea con `nazre@gmail.com`
4. Activate. Ve a `/admin/flags/meerkat.nia.v2`. Debe existir, rollout_pct=10, allowlist=[nazre@gmail.com]
5. Revierte el `NIA_CONFIGS[2]` local antes de commit

- [ ] **Step 5: Commit**

```powershell
git add src/components/admin/ActivateVersionModal.tsx
git commit -m @'
feat(admin): activate modal con slider initial_pct + allowlist

Slider 0-100 step 5, default 10. Textarea allowlist default
nazre@gmail.com para dogfooding. Envío al backend con los
2 campos nuevos que Task 12 ya acepta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 14: Snapshot Cron

**Files:**
- Create: `src/app/api/cron/flags-snapshot/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `feature_flags` table, `voice_agents.portal_email`, `hashBucket` de Task 2
- Produces: filas diarias en `feature_flag_daily_snapshots`.

- [ ] **Step 1: Create cron route**

Crear `src/app/api/cron/flags-snapshot/route.ts`:

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashBucket } from '@/lib/feature-flags/evaluator';
import type { FlagRow, FlagCounts } from '@/lib/feature-flags/types';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: flags, error: flagErr } = await supabase.from('feature_flags').select('*');
  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 });

  const { data: orgs, error: orgErr } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .not('portal_email', 'is', null);
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  const uniqueEmails = Array.from(new Set((orgs ?? []).map(o => o.portal_email as string)));
  const today = new Date().toISOString().slice(0, 10);

  let inserted = 0;
  for (const flag of (flags ?? []) as FlagRow[]) {
    const counts: FlagCounts = { orgs_on: 0, orgs_off: 0, orgs_via_hash: 0, orgs_via_allowlist: 0, orgs_via_denylist: 0 };
    for (const email of uniqueEmails) {
      if (flag.killed) { counts.orgs_off++; continue; }
      if (flag.denylist.includes(email)) { counts.orgs_off++; counts.orgs_via_denylist++; continue; }
      if (flag.allowlist.includes(email)) { counts.orgs_on++; counts.orgs_via_allowlist++; continue; }
      counts.orgs_via_hash++;
      const bucket = hashBucket(email, flag.flag_key);
      if (bucket < flag.rollout_pct) counts.orgs_on++;
      else counts.orgs_off++;
    }
    const { error: upErr } = await supabase
      .from('feature_flag_daily_snapshots')
      .upsert({ flag_key: flag.flag_key, day: today, counts }, { onConflict: 'flag_key,day' });
    if (upErr) console.error('[flags-snapshot] upsert error', { flag: flag.flag_key, error: upErr.message });
    else inserted++;
  }

  return NextResponse.json({ ok: true, flags_processed: (flags ?? []).length, snapshots_written: inserted, orgs_evaluated: uniqueEmails.length });
}
```

- [ ] **Step 2: Register the cron in vercel.json**

Editar `vercel.json`. Agregar al array `crons`:

```json
{ "path": "/api/cron/flags-snapshot", "schedule": "0 10 * * *" }
```

(4am America/Monterrey = 10 UTC. Corriendo antes de business hours.)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Smoke test**

```powershell
$env:CRON = (Select-String -Path .env.local -Pattern '^CRON_SECRET=' | ForEach-Object { $_.Line -replace '^CRON_SECRET=','' -replace '"','' })
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/flags-snapshot" -Headers @{ Authorization = "Bearer $env:CRON" }
```

Expected: `{ ok: true, flags_processed: N, snapshots_written: N, orgs_evaluated: M }`.

Verifica en Supabase que aparecieron filas en `feature_flag_daily_snapshots` para hoy.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/cron/flags-snapshot/route.ts vercel.json
git commit -m @'
feat(cron): flags-snapshot diario a 10 UTC (4am Monterrey)

Para cada flag calcula orgs_on/off contra todos los
portal_email distinct de voice_agents. Upsert por
(flag_key, day). ~5000 evaluaciones/día con ~100 orgs y
~50 flags, muy por debajo del timeout de Vercel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
'@
```

---

## Post-plan checklist (Nazre corre manualmente después de merge)

1. Correr `migrations/20260731_feature_flags.sql` en Supabase Studio.
2. Verificar `/admin/flags` accesible con cookie admin, vacía inicialmente.
3. Verificar cron registrado en Vercel (dashboard → Settings → Crons debe listar `flags-snapshot`).
4. Verificar sync de un agente conocido sigue devolviendo la misma versión (fallback legacy funcionando).
5. Primera prueba real: agregar `NIA_CONFIGS[2]` en código (con cambio mínimo, ej. `temperature: 0.36`), push, deploy. Golden test debería correr auto. Cuando pase, activar desde `/admin/versiones` con `initial_pct=10, allowlist=[nazre@]`. Verificar en `/admin/flags/meerkat.nia.v2` que el flag existe. Verificar en llamada real desde `nazre@` que Vapi está sirviendo v2 (revisar `voice_calls.model` o logs).

## Ver también

- Spec: `docs/superpowers/specs/2026-07-31-feature-flags-rollout-design.md` (commit 74e42e8)
- Pilar 1 versioning: `docs/superpowers/specs/2026-07-30-meerkat-versioning-design.md`
- Pilar 4 golden tests: `docs/superpowers/specs/2026-07-30-golden-tests-suite-design.md`
