# Model + Prompt Versioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md`](../specs/2026-07-30-model-prompt-versioning-design.md) (commit 40cf634)

**Goal:** Reemplazar `MEERKAT_MODEL_CONFIG` hardcoded en `sync.ts` con un sistema de versiones (código + puntero en DB) que permite rollback instantáneo sin re-deploy y pinning per-agent, con Portal admin UI completa para operar rollouts.

**Architecture:** Cada meerkat tiene N versiones coexistiendo en el bundle (`NIA_CONFIGS = { 1: {...}, 2: {...} }`). Puntero en Supabase (`meerkat_active_versions`) decide cuál sirve. Resolver central con cache in-memory 60s TTL. Agentes pueden fijarse en versión específica vía `features.pinned_meerkat_version`. Admin UI en `/admin/versiones` + tab en ficha del agente.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres), Anthropic Claude via Vapi (assistants) o custom-LLM, Tailwind + Lucide icons. Sin framework de tests unitarios en repo — smoke tests con `npx tsx` scripts.

## Global Constraints

- **Rollback debe ser instantáneo (SQL flip, sin re-deploy).** Cualquier decisión que reintroduzca la necesidad de deploy para rollback es un fallo del plan.
- **Byte-identical migration:** el refactor NO debe cambiar el JSON de `buildVapiAssistant()` para ningún agente. Snapshot test lo garantiza.
- **NUNCA borrar versiones** en `MEERKAT_CONFIGS` sin migrar antes `active_version` y todos los `pinned_meerkat_version`. Comentario prominente en el archivo.
- **Admin-only** para todas las rutas nuevas de `/api/admin/versiones`. Cookie `Centinelia_admin` = `process.env.ADMIN_SECRET`, mismo patrón que `src/app/api/admin/resync-all/route.ts`.
- **UI copy rules:** sin emojis (usar iconos Lucide React), sin "IA" en copy visible del portal/setup/landing.
- **Next.js 16:** este repo tiene breaking changes vs training data. Leer `node_modules/next/dist/docs/` antes de tocar APIs de Next.js. Rutas usan `params: Promise<{...}>`, `cookies()` es async.
- **Commits:** conventional commit style (`feat:`, `fix:`, `docs:`, `chore:`); NO añadir Co-Authored-By footer en commits creados por el implementador — cada tarea comitea explícitamente por sí sola.
- **MTTR floor de rollback: 60s** (cache TTL). Aceptado y documentado — no invalidar cross-instance en este MVP.

---

## File Map

### Files to CREATE

| Path | Responsibility |
|---|---|
| `migrations/20260730_meerkat_versioning.sql` | Tablas `meerkat_active_versions`, `meerkat_version_history`, seed inicial de 10 meerkats en v1 |
| `sql/tests/meerkat_versioning.verify.sql` | Queries manuales post-migration para validar el seed |
| `src/lib/vapi/meerkat-configs.ts` | `MEERKAT_CONFIGS` versionado + `MeerkatModelConfig` type (movido desde sync.ts) |
| `src/lib/vapi/resolve-meerkat.ts` | `resolveMeerkatConfig()` con cache in-memory 60s + `getActiveVersion()` |
| `src/lib/vapi/resync-meerkat.ts` | `resyncAgentsByMeerkat(meerkatId)` — subset de push-all filtrado |
| `scripts/snapshot-vapi-assistants.ts` | Captura JSON pre-refactor (baseline) |
| `scripts/verify-vapi-assistants-snapshot.ts` | Compara current build vs baseline (usado en Test 1) |
| `__snapshots__/vapi-assistants/` | Directorio con JSON snapshots por meerkat |
| `src/app/api/admin/versiones/route.ts` | GET listado de meerkats con state |
| `src/app/api/admin/versiones/[meerkat]/activate/route.ts` | POST activate |
| `src/app/api/admin/versiones/[meerkat]/history/route.ts` | GET history |
| `src/app/api/admin/agentes/[id]/pin-version/route.ts` | PATCH pin-version en agent features |
| `src/app/admin/versiones/page.tsx` | Server component: tabla principal `/admin/versiones` |
| `src/components/admin/ActivateVersionModal.tsx` | Client component: modal de confirmación |
| `src/components/admin/VersionHistoryDrawer.tsx` | Client component: drawer de historial |
| `src/components/admin/AgentVersionTab.tsx` | Client component: tab "Versión" en ficha del agente |

### Files to MODIFY

| Path | Change |
|---|---|
| `src/types/agent.ts` | Añadir `pinned_meerkat_version?: number \| null` a `AgentFeatures` |
| `src/lib/vapi/sync.ts` | Borrar `MEERKAT_MODEL_CONFIG` (líneas 340-378); `buildVapiAssistant` línea 407 pasa a `await resolveMeerkatConfig(meerkatId, features.pinned_meerkat_version ?? null)` |
| `src/app/admin/agentes/[id]/page.tsx` | Renderizar `<AgentVersionTab>` en la ficha del agente |
| `src/components/admin/AdminSidebar.tsx` (o donde viva el sidebar admin) | Agregar entry "Versiones" con icono `GitBranch` |

### Dependencies (already in repo — no install)

- `@supabase/supabase-js` — DB client (`createAdminClient()` desde `@/lib/supabase/admin`)
- `lucide-react` — iconos
- `next` v16 — framework

---

## Task 1: SQL Migration (tablas + seed)

**Files:**
- Create: `migrations/20260730_meerkat_versioning.sql`
- Create: `sql/tests/meerkat_versioning.verify.sql`

**Interfaces:**
- Produces:
  - Table `meerkat_active_versions(meerkat_id TEXT PK, active_version INT, activated_at TIMESTAMPTZ, activated_by TEXT, notes TEXT)`
  - Table `meerkat_version_history(id UUID PK, meerkat_id TEXT, from_version INT NULL, to_version INT, changed_at TIMESTAMPTZ, changed_by TEXT, reason TEXT)`
  - Index `idx_meerkat_history_meerkat` en `(meerkat_id, changed_at DESC)`
  - Seed: 10 filas en `meerkat_active_versions` (nia, noah, nico, nelia, nara, naia, neo, nova, nox, niva) todas en `active_version=1`, `activated_by='system'`, `notes='baseline pre-versioning'`

- [ ] **Step 1: Crear la migration**

Crear `migrations/20260730_meerkat_versioning.sql`:

```sql
-- Model + Prompt Versioning — pilar 1 evolution framework
-- Spec: docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md

create table if not exists meerkat_active_versions (
  meerkat_id      text        primary key,
  active_version  int         not null,
  activated_at    timestamptz not null default now(),
  activated_by    text,
  notes           text
);

create table if not exists meerkat_version_history (
  id            uuid         primary key default gen_random_uuid(),
  meerkat_id    text         not null,
  from_version  int,
  to_version    int          not null,
  changed_at    timestamptz  not null default now(),
  changed_by    text,
  reason        text
);

create index if not exists idx_meerkat_history_meerkat
  on meerkat_version_history (meerkat_id, changed_at desc);

-- Seed inicial: todos los 10 meerkats arrancan en v1 (= snapshot del estado pre-versioning).
-- ON CONFLICT DO NOTHING → migration es idempotente y reintentable.
insert into meerkat_active_versions (meerkat_id, active_version, activated_by, notes) values
  ('nia',   1, 'system', 'baseline pre-versioning'),
  ('noah',  1, 'system', 'baseline pre-versioning'),
  ('nico',  1, 'system', 'baseline pre-versioning'),
  ('nelia', 1, 'system', 'baseline pre-versioning'),
  ('nara',  1, 'system', 'baseline pre-versioning'),
  ('naia',  1, 'system', 'baseline pre-versioning'),
  ('neo',   1, 'system', 'baseline pre-versioning'),
  ('nova',  1, 'system', 'baseline pre-versioning'),
  ('nox',   1, 'system', 'baseline pre-versioning'),
  ('niva',  1, 'system', 'baseline pre-versioning')
on conflict (meerkat_id) do nothing;
```

- [ ] **Step 2: Crear queries de verificación**

Crear `sql/tests/meerkat_versioning.verify.sql`:

```sql
-- Debe retornar 10 filas, todas en active_version=1
select meerkat_id, active_version, activated_by, notes from meerkat_active_versions order by meerkat_id;

-- Debe retornar 0 filas (historial arranca vacío)
select count(*) as history_count from meerkat_version_history;

-- Debe retornar el índice
select indexname from pg_indexes where tablename = 'meerkat_version_history';
```

- [ ] **Step 3: Correr la migration en staging (o local Supabase)**

Comando (asumiendo psql configurado con `.env.local`):

```bash
psql "$SUPABASE_DB_URL" -f migrations/20260730_meerkat_versioning.sql
psql "$SUPABASE_DB_URL" -f sql/tests/meerkat_versioning.verify.sql
```

Esperado: 10 filas del primer query, `history_count=0`, `indexname=idx_meerkat_history_meerkat`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260730_meerkat_versioning.sql sql/tests/meerkat_versioning.verify.sql
git commit -m "feat(sql): meerkat_active_versions + meerkat_version_history tables"
```

---

## Task 2: Baseline snapshot capture (pre-refactor)

**Files:**
- Create: `scripts/snapshot-vapi-assistants.ts`
- Create: `__snapshots__/vapi-assistants/.gitkeep`

**Interfaces:**
- Produces: JSON snapshots en `__snapshots__/vapi-assistants/{meerkat_id}.json` — output byte-idéntico de `buildVapiAssistant()` para un agente representativo por cada meerkat, capturado del código actual (pre-refactor).

**Contexto crítico:** Este script se corre AHORA, antes de tocar `sync.ts`. Los snapshots son el "ground truth" contra el que la Task 4 verifica que el refactor no cambia nada.

- [ ] **Step 1: Escribir el script de captura**

Crear `scripts/snapshot-vapi-assistants.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { buildVapiAssistantForSnapshot } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const MEERKATS = ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova', 'nox', 'niva'];
const OUT_DIR = '__snapshots__/vapi-assistants';

async function main() {
  const supabase = createAdminClient();
  mkdirSync(OUT_DIR, { recursive: true });

  for (const meerkatId of MEERKATS) {
    // Toma el primer agente activo con este meerkat_role_id
    const { data } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('active', true)
      .filter('features->>meerkat_role_id', 'eq', meerkatId)
      .limit(1)
      .maybeSingle();

    if (!data) {
      console.warn(`[skip] no active agent found for meerkat=${meerkatId}`);
      continue;
    }

    const assistant = await buildVapiAssistantForSnapshot(data as VoiceAgent);
    const filepath = join(OUT_DIR, `${meerkatId}.json`);
    writeFileSync(filepath, JSON.stringify(assistant, null, 2));
    console.log(`[snapshot] ${meerkatId} → ${filepath} (${JSON.stringify(assistant).length} bytes)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Exportar helper de snapshot desde sync.ts**

`buildVapiAssistant` es interno (no exportado). Exponer una versión para el snapshot sin modificar el original.

En `src/lib/vapi/sync.ts`, al final del archivo agregar:

```typescript
// Exported for snapshot testing only. Wraps buildVapiAssistant with the same
// inputs it receives during a real sync (empty tools + peers by default).
export async function buildVapiAssistantForSnapshot(agent: VoiceAgent) {
  return buildVapiAssistant(agent, [], [], null);
}
```

Ojo: si `buildVapiAssistant` no es async, no le pongas `await`. Verificar la firma en `sync.ts:382`.

- [ ] **Step 3: Correr el script y capturar snapshots**

```bash
npx tsx scripts/snapshot-vapi-assistants.ts
```

Esperado: 10 archivos JSON en `__snapshots__/vapi-assistants/`, uno por meerkat. Si algún meerkat no tiene agente activo, el script lo salta con warning — está bien para el MVP, pero anotarlo.

- [ ] **Step 4: Verificar que los JSONs son válidos**

```bash
node -e "require('fs').readdirSync('__snapshots__/vapi-assistants').filter(f=>f.endsWith('.json')).forEach(f=>{const j=JSON.parse(require('fs').readFileSync('__snapshots__/vapi-assistants/'+f)); console.log(f, 'model=', j.model?.model, 'has_messages=', !!j.model?.messages)});"
```

Esperado: cada archivo lista su modelo y confirma presencia de messages.

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot-vapi-assistants.ts __snapshots__/vapi-assistants/ src/lib/vapi/sync.ts
git commit -m "chore(snapshot): baseline vapi assistants pre-versioning refactor"
```

---

## Task 3: Type update — pinned_meerkat_version

**Files:**
- Modify: `src/types/agent.ts` (línea ~40, al final del bloque de meerkat flags)

**Interfaces:**
- Produces: campo opcional `pinned_meerkat_version?: number | null` en `AgentFeatures`.

- [ ] **Step 1: Extender AgentFeatures**

En `src/types/agent.ts`, dentro de `interface AgentFeatures`, después de la línea `hcp_full?: boolean;` y antes de `skip_aup?: boolean;` (o al final del bloque de meerkat flags):

```typescript
  // Pin per-agent a una versión específica de MEERKAT_CONFIGS[meerkat_role_id].
  // Si está seteado, el resolver ignora meerkat_active_versions.active_version
  // para este agente. Ver docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md
  pinned_meerkat_version?: number | null;
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/types/agent.ts
git commit -m "feat(types): add pinned_meerkat_version to AgentFeatures"
```

---

## Task 4: Versioned configs + resolver + integrate sync.ts + snapshot verify

**Files:**
- Create: `src/lib/vapi/meerkat-configs.ts`
- Create: `src/lib/vapi/resolve-meerkat.ts`
- Create: `scripts/verify-vapi-assistants-snapshot.ts`
- Modify: `src/lib/vapi/sync.ts` (borrar líneas 340-378, cambiar línea 407)

**Interfaces:**
- Consumes: `AgentFeatures.pinned_meerkat_version` (Task 3), `meerkat_active_versions` table (Task 1)
- Produces:
  - `MEERKAT_CONFIGS: Record<string, Record<number, MeerkatModelConfig>>` con las 10 configs actuales seedeadas como version 1
  - `type MeerkatModelConfig` (movido desde sync.ts)
  - `DEFAULT_MODEL_CONFIG: MeerkatModelConfig` (movido desde sync.ts)
  - `async function resolveMeerkatConfig(meerkatId: string, pinnedVersion: number | null): Promise<MeerkatModelConfig>`
  - `async function getActiveVersion(meerkatId: string): Promise<number>` (cached 60s)
  - `function clearMeerkatVersionCache(): void` (para tests)

- [ ] **Step 1: Crear `meerkat-configs.ts` copiando el contenido actual como v1**

Crear `src/lib/vapi/meerkat-configs.ts`. Copiar EXACTAMENTE las configs actuales de `sync.ts:355-378` como versión 1 de cada meerkat:

```typescript
// Model + Prompt Versioning — pilar 1 evolution framework.
//
// REGLAS DURAS:
// 1. NUNCA editar una versión activa. Para cualquier cambio, agrega una nueva versión
//    (ej. NIA_CONFIGS[2] = { ... }). Editar in-place rompe la garantía de rollback.
// 2. NUNCA borrar una versión que exista como active_version en meerkat_active_versions
//    o como pinned_meerkat_version en algún voice_agents.features. El resolver caería
//    al fallback y perderías el rollback.
// 3. Cuando agregues NIA_CONFIGS[N], NO cambies el active_version en DB automáticamente.
//    Deploy primero (v_N disponible pero no activa), luego /admin/versiones para activar.

export interface MeerkatModelConfig {
  provider:              string;
  model:                 string;
  temperature:           number;
  maxTokens:             number;
  speed:                 number;
  minChars:              number;
  voiceModel?:           string;
  sttModel?:             string;
  punctuationBoundaries?: string[];
}

type MeerkatConfigVersions = Record<number, MeerkatModelConfig>;

const NIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 400, speed: 0.91, minChars: 25, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NOAH_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.60, maxTokens: 150, speed: 1.00, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NICO_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 110, speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NELIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.40, maxTokens: 110, speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
};

const NARA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.30, maxTokens: 150, speed: 1.02, minChars: 28, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NAIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 150, speed: 1.02, minChars: 28, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NEO_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.20, maxTokens: 110, speed: 1.05, minChars: 25, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NOVA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.70, maxTokens: 150, speed: 1.05, minChars: 25, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NOX_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.15, maxTokens: 80, speed: 1.05, minChars: 25, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

const NIVA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0.25, maxTokens: 150, speed: 1.00, minChars: 28, voiceModel: 'eleven_flash_v2_5', sttModel: 'nova-2' },
};

export const MEERKAT_CONFIGS: Record<string, MeerkatConfigVersions> = {
  nia:   NIA_CONFIGS,
  noah:  NOAH_CONFIGS,
  nico:  NICO_CONFIGS,
  nelia: NELIA_CONFIGS,
  nara:  NARA_CONFIGS,
  naia:  NAIA_CONFIGS,
  neo:   NEO_CONFIGS,
  nova:  NOVA_CONFIGS,
  nox:   NOX_CONFIGS,
  niva:  NIVA_CONFIGS,
};

export const DEFAULT_MODEL_CONFIG: MeerkatModelConfig = {
  provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.40, maxTokens: 150,
  speed: 0.98, minChars: 28, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3',
};
```

CRÍTICO: los valores deben ser EXACTAMENTE los mismos que hoy en `sync.ts:355-378`. Copiar-pegar, no reescribir.

- [ ] **Step 2: Crear el resolver con cache**

Crear `src/lib/vapi/resolve-meerkat.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS, DEFAULT_MODEL_CONFIG, type MeerkatModelConfig } from './meerkat-configs';

const CACHE_TTL_MS = 60_000; // 60s — MTTR floor documentado en spec
const cache = new Map<string, { version: number; expiresAt: number }>();

export function clearMeerkatVersionCache(): void {
  cache.clear();
}

async function fetchActiveVersion(meerkatId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkatId)
    .maybeSingle();

  if (error) {
    console.error('[resolve-meerkat] fetch error', { meerkatId, error: error.message });
    return 1; // Fallback silencioso — no romper llamadas
  }
  if (!data) {
    console.warn('[resolve-meerkat] no active version row', { meerkatId });
    return 1;
  }
  return data.active_version;
}

async function getActiveVersion(meerkatId: string): Promise<number> {
  const now = Date.now();
  const hit = cache.get(meerkatId);
  if (hit && hit.expiresAt > now) return hit.version;

  const version = await fetchActiveVersion(meerkatId);
  cache.set(meerkatId, { version, expiresAt: now + CACHE_TTL_MS });
  return version;
}

export async function resolveMeerkatConfig(
  meerkatId: string,
  pinnedVersion: number | null,
): Promise<MeerkatModelConfig> {
  const versions = MEERKAT_CONFIGS[meerkatId];
  if (!versions) return DEFAULT_MODEL_CONFIG;

  // 1. Pin per-agent gana sobre active global
  if (pinnedVersion != null && versions[pinnedVersion]) return versions[pinnedVersion];
  if (pinnedVersion != null && !versions[pinnedVersion]) {
    console.warn('[resolve-meerkat] invalid pin, ignoring', { meerkatId, pinnedVersion });
  }

  // 2. Active version del meerkat (cached)
  const active = await getActiveVersion(meerkatId);
  if (versions[active]) return versions[active];

  // 3. Fallback: última versión conocida en el bundle
  const availableVersions = Object.keys(versions).map(Number);
  const latestKnown = Math.max(...availableVersions);
  console.warn('[resolve-meerkat] stale active_version, falling back', { meerkatId, active, latestKnown });
  return versions[latestKnown];
}
```

- [ ] **Step 3: Refactor `sync.ts` — borrar constantes locales y usar resolver**

En `src/lib/vapi/sync.ts`:

a) Borrar el interface `MeerkatModelConfig` (líneas ~340-350) — ahora vive en meerkat-configs.ts.
b) Borrar el `MEERKAT_MODEL_CONFIG` object (líneas ~355-373).
c) Borrar el `DEFAULT_MODEL_CONFIG` object (líneas ~375-378).
d) Al inicio del archivo, agregar import:

```typescript
import { resolveMeerkatConfig, type MeerkatModelConfig } from './resolve-meerkat';
```

Nota: `MeerkatModelConfig` se re-exporta desde `resolve-meerkat.ts` (o desde `meerkat-configs.ts`). Asegurar re-export.

e) En `buildVapiAssistant` (~línea 407), cambiar:

```typescript
// ANTES:
const meerkatId = agent.features.meerkat_role_id;
const cfg: MeerkatModelConfig = (meerkatId ? MEERKAT_MODEL_CONFIG[meerkatId] : undefined) ?? DEFAULT_MODEL_CONFIG;

// DESPUÉS:
const meerkatId = agent.features.meerkat_role_id;
const cfg: MeerkatModelConfig = await resolveMeerkatConfig(
  meerkatId ?? '',
  agent.features.pinned_meerkat_version ?? null,
);
```

f) Si `buildVapiAssistant` no era `async`, marcarla como `async` y hacer que todos sus callers usen `await`. Verificar `createVapiAssistant` (línea 595) y `updateVapiAssistant` (línea 613) — probablemente ya son async.

- [ ] **Step 4: Escribir el script de verificación de snapshot**

Crear `scripts/verify-vapi-assistants-snapshot.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { buildVapiAssistantForSnapshot } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MEERKATS = ['nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova', 'nox', 'niva'];
const SNAPSHOT_DIR = '__snapshots__/vapi-assistants';

async function main() {
  const supabase = createAdminClient();
  let failures = 0;

  for (const meerkatId of MEERKATS) {
    const snapshotPath = join(SNAPSHOT_DIR, `${meerkatId}.json`);
    if (!existsSync(snapshotPath)) {
      console.warn(`[skip] no snapshot for ${meerkatId}`);
      continue;
    }

    const { data } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('active', true)
      .filter('features->>meerkat_role_id', 'eq', meerkatId)
      .limit(1)
      .maybeSingle();

    if (!data) { console.warn(`[skip] no agent for ${meerkatId}`); continue; }

    const current = await buildVapiAssistantForSnapshot(data as VoiceAgent);
    const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));

    const currentStr = JSON.stringify(current, null, 2);
    const expectedStr = JSON.stringify(expected, null, 2);

    if (currentStr === expectedStr) {
      console.log(`[ok]   ${meerkatId}`);
    } else {
      console.error(`[FAIL] ${meerkatId} — output differs from snapshot`);
      // Diff simple: primer campo que difiere
      const currKeys = Object.keys(current);
      for (const k of currKeys) {
        const a = JSON.stringify((current as any)[k]);
        const b = JSON.stringify((expected as any)[k]);
        if (a !== b) console.error(`  differs at .${k}`);
      }
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} snapshot mismatch(es) — refactor changed output. Investigate before deploy.`);
    process.exit(1);
  }
  console.log(`\nAll snapshots match. Safe to deploy.`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Correr la verificación**

```bash
npx tsc --noEmit
npx tsx scripts/verify-vapi-assistants-snapshot.ts
```

Esperado: `[ok] <meerkat>` para cada snapshot capturado, luego "All snapshots match. Safe to deploy."

Si falla algún meerkat: NO commitear. Investigar por qué el refactor cambia el output — probablemente falta copiar algún campo, o un valor difiere entre las constantes originales y el nuevo `MEERKAT_CONFIGS`.

- [ ] **Step 6: Smoke test del resolver con distintos inputs**

Crear `scripts/smoke-resolve-meerkat.ts`:

```typescript
import { resolveMeerkatConfig, clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';

async function main() {
  clearMeerkatVersionCache();

  // Caso 1: meerkat conocido sin pin
  const nia = await resolveMeerkatConfig('nia', null);
  console.log('nia (no pin):', nia.model, 'temp=', nia.temperature);

  // Caso 2: meerkat conocido con pin válido
  const niaPin1 = await resolveMeerkatConfig('nia', 1);
  console.log('nia (pin=1):', niaPin1.model);

  // Caso 3: meerkat conocido con pin inválido (debe caer a active + warn)
  const niaPinBad = await resolveMeerkatConfig('nia', 99);
  console.log('nia (pin=99, invalid):', niaPinBad.model);

  // Caso 4: meerkat desconocido (debe retornar DEFAULT + warn)
  const unknown = await resolveMeerkatConfig('zzz', null);
  console.log('zzz (unknown):', unknown.model);

  // Caso 5: cache hit (segunda call no debe llamar DB — visible por ausencia de log)
  const niaAgain = await resolveMeerkatConfig('nia', null);
  console.log('nia (cache):', niaAgain.model);
}

main();
```

Correr:

```bash
npx tsx scripts/smoke-resolve-meerkat.ts
```

Esperado:
- Caso 1: `nia (no pin): claude-haiku-4-5-20251001 temp= 0.35`
- Caso 2: mismo modelo
- Caso 3: warning + mismo modelo que caso 1
- Caso 4: warning `no active version row` (o `unknown meerkat` según el path) + modelo DEFAULT
- Caso 5: mismo output, no re-fetch

- [ ] **Step 7: Commit**

```bash
git add src/lib/vapi/meerkat-configs.ts src/lib/vapi/resolve-meerkat.ts src/lib/vapi/sync.ts scripts/verify-vapi-assistants-snapshot.ts scripts/smoke-resolve-meerkat.ts
git commit -m "feat(vapi): versioned meerkat configs + resolver with 60s cache"
```

---

## Task 5: Resync-by-meerkat helper (para post-flip)

**Files:**
- Create: `src/lib/vapi/resync-meerkat.ts`

**Interfaces:**
- Consumes: `updateVapiAssistant` (existente en sync.ts), `createAdminClient`
- Produces: `async function resyncAgentsByMeerkat(meerkatId: string): Promise<{ synced: number; errors: number; agentIds: string[] }>` — busca todos los agentes activos con ese `meerkat_role_id` y hace update de su Vapi assistant. Usado por Task 6 (POST activate).

**Contexto:** después de flip de version en DB, los agentes en Vapi native mode retienen el assistant viejo hasta el próximo sync. Este helper fuerza el resync solo del subset afectado (no todos como `pushConversationalPromptsToAllAgents`).

- [ ] **Step 1: Escribir el helper**

Crear `src/lib/vapi/resync-meerkat.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { updateVapiAssistant } from './sync';
import type { VoiceAgent } from '@/types/agent';

export async function resyncAgentsByMeerkat(
  meerkatId: string,
): Promise<{ synced: number; errors: number; agentIds: string[] }> {
  const supabase = createAdminClient();

  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('active', true)
    .filter('features->>meerkat_role_id', 'eq', meerkatId)
    .not('vapi_agent_id', 'is', null);

  if (error) {
    console.error('[resync-meerkat] fetch error', { meerkatId, error: error.message });
    return { synced: 0, errors: 1, agentIds: [] };
  }

  let synced = 0;
  let errors = 0;
  const agentIds: string[] = [];

  for (const agent of (agents ?? []) as VoiceAgent[]) {
    if (!agent.vapi_agent_id) continue;
    agentIds.push(agent.id);
    try {
      const ok = await updateVapiAssistant(agent.vapi_agent_id, agent);
      if (ok) synced++;
      else errors++;
    } catch (e) {
      console.error('[resync-meerkat] update failed', { agentId: agent.id, error: (e as Error).message });
      errors++;
    }
  }

  return { synced, errors, agentIds };
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/vapi/resync-meerkat.ts
git commit -m "feat(vapi): resync-by-meerkat helper for post-flip propagation"
```

---

## Task 6: Admin API — GET list + POST activate

**Files:**
- Create: `src/app/api/admin/versiones/route.ts`
- Create: `src/app/api/admin/versiones/[meerkat]/activate/route.ts`

**Interfaces:**
- Consumes: `MEERKAT_CONFIGS` (Task 4), `resyncAgentsByMeerkat` (Task 5), `clearMeerkatVersionCache` (Task 4)
- Produces:
  - `GET /api/admin/versiones` → `{ meerkats: Array<{ meerkat_id, active_version, activated_at, activated_by, available_versions: number[], agent_count: number, pinned_count: number }> }`
  - `POST /api/admin/versiones/:meerkat/activate` — body `{ version: number, reason?: string }` → 200 `{ ok: true, resync: { synced, errors } }` | 400 `{ error }` | 401

- [ ] **Step 1: Crear helper de auth compartido (si no existe)**

Verificar si existe un helper `isAdmin()` compartido. Si no, replicar el patrón inline (ya usado en `src/app/api/admin/resync-all/route.ts:5-8`):

```typescript
import { cookies } from 'next/headers';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}
```

Si el patrón se repite en 3+ archivos, extraer a `src/lib/admin/auth.ts` como parte de este task.

- [ ] **Step 2: GET /api/admin/versiones**

Crear `src/app/api/admin/versiones/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: activeRows, error: activeErr } = await supabase
    .from('meerkat_active_versions')
    .select('meerkat_id, active_version, activated_at, activated_by, notes');

  if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });

  // Counts de agentes por meerkat + pinned counts
  const { data: agents, error: agentsErr } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('active', true);

  if (agentsErr) return NextResponse.json({ error: agentsErr.message }, { status: 500 });

  const agentCountByMeerkat = new Map<string, number>();
  const pinnedCountByMeerkat = new Map<string, number>();
  for (const a of agents ?? []) {
    const mId = (a.features as any)?.meerkat_role_id as string | undefined;
    if (!mId) continue;
    agentCountByMeerkat.set(mId, (agentCountByMeerkat.get(mId) ?? 0) + 1);
    if ((a.features as any)?.pinned_meerkat_version != null) {
      pinnedCountByMeerkat.set(mId, (pinnedCountByMeerkat.get(mId) ?? 0) + 1);
    }
  }

  const meerkats = (activeRows ?? []).map(row => ({
    meerkat_id: row.meerkat_id,
    active_version: row.active_version,
    activated_at: row.activated_at,
    activated_by: row.activated_by,
    notes: row.notes,
    available_versions: Object.keys(MEERKAT_CONFIGS[row.meerkat_id] ?? {}).map(Number).sort((a, b) => a - b),
    agent_count: agentCountByMeerkat.get(row.meerkat_id) ?? 0,
    pinned_count: pinnedCountByMeerkat.get(row.meerkat_id) ?? 0,
  }));

  return NextResponse.json({ meerkats });
}
```

- [ ] **Step 3: POST activate**

Crear `src/app/api/admin/versiones/[meerkat]/activate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { clearMeerkatVersionCache } from '@/lib/vapi/resolve-meerkat';
import { resyncAgentsByMeerkat } from '@/lib/vapi/resync-meerkat';

async function currentAdminEmail(): Promise<{ ok: boolean; email?: string }> {
  const store = await cookies();
  const secret = store.get('Centinelia_admin')?.value;
  if (secret !== process.env.ADMIN_SECRET) return { ok: false };
  // Admin panel no tiene sesión individual — usar 'admin@centinelia.mx' como marker,
  // o si en el futuro hay email en la cookie, extraerlo aquí.
  return { ok: true, email: 'admin@centinelia.mx' };
}

interface Params { params: Promise<{ meerkat: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await currentAdminEmail();
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const body = await req.json().catch(() => ({}));
  const { version, reason } = body as { version?: number; reason?: string };

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Invalid version' }, { status: 400 });
  }

  // Validar que la versión existe en el bundle
  const versionsInCode = MEERKAT_CONFIGS[meerkat];
  if (!versionsInCode) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!versionsInCode[version]) {
    return NextResponse.json({
      error: `Version ${version} does not exist in code for ${meerkat}. Available: ${Object.keys(versionsInCode).join(', ')}`,
    }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Read current active version (para history from_version)
  const { data: current } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkat)
    .maybeSingle();

  const currentVersion = current?.active_version ?? null;

  // No-op si ya está en esa versión (evitar history duplicado)
  if (currentVersion === version) {
    return NextResponse.json({ ok: true, noop: true, message: `Already active on v${version}` });
  }

  // Determinar reason automático si no viene
  const finalReason = reason ?? (currentVersion != null && version < currentVersion ? 'rollback' : 'rollout');

  // Transacción implícita: history primero, luego UPDATE active_versions.
  // Si el UPDATE falla, tenemos history huérfano — pero es append-only y auditable.
  const { error: histErr } = await supabase.from('meerkat_version_history').insert({
    meerkat_id: meerkat,
    from_version: currentVersion,
    to_version: version,
    changed_by: auth.email,
    reason: finalReason,
  });
  if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 });

  const { error: updErr } = await supabase
    .from('meerkat_active_versions')
    .update({
      active_version: version,
      activated_at: new Date().toISOString(),
      activated_by: auth.email,
      notes: reason ?? null,
    })
    .eq('meerkat_id', meerkat);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Invalidar cache local (esta instancia). Otras instancias esperan 60s TTL.
  clearMeerkatVersionCache();

  // Fire-and-forget resync a Vapi. No bloquea la response — el UI muestra spinner
  // pero el flip DB ya es efectivo.
  resyncAgentsByMeerkat(meerkat).then(result => {
    console.log('[activate] resync complete', { meerkat, version, ...result });
  }).catch(err => {
    console.error('[activate] resync failed', { meerkat, version, error: err.message });
  });

  return NextResponse.json({
    ok: true,
    meerkat,
    from_version: currentVersion,
    to_version: version,
    reason: finalReason,
    message: `${meerkat} v${version} activated. Resync in progress.`,
  });
}
```

- [ ] **Step 4: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Smoke test manual con curl (staging)**

```bash
# Sin auth → 401
curl -X POST http://localhost:3000/api/admin/versiones/nia/activate \
  -H "Content-Type: application/json" -d '{"version": 1}'

# Con cookie admin → 200 (asumiendo Centinelia_admin=<ADMIN_SECRET>)
curl -X POST http://localhost:3000/api/admin/versiones/nia/activate \
  -H "Content-Type: application/json" \
  -H "Cookie: Centinelia_admin=$ADMIN_SECRET" \
  -d '{"version": 1}'

# GET list
curl http://localhost:3000/api/admin/versiones \
  -H "Cookie: Centinelia_admin=$ADMIN_SECRET"
```

Esperado: 401 sin auth, 200 con auth. GET debe listar 10 meerkats.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/versiones/
git commit -m "feat(api): GET /admin/versiones + POST activate with resync trigger"
```

---

## Task 7: Admin API — GET history

**Files:**
- Create: `src/app/api/admin/versiones/[meerkat]/history/route.ts`

**Interfaces:**
- Consumes: `meerkat_version_history` table
- Produces: `GET /api/admin/versiones/:meerkat/history` → `{ history: Array<{ id, from_version, to_version, changed_at, changed_by, reason }> }` (ordered by changed_at DESC, limit 50)

- [ ] **Step 1: Crear el route**

Crear `src/app/api/admin/versiones/[meerkat]/history/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

interface Params { params: Promise<{ meerkat: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('meerkat_version_history')
    .select('id, from_version, to_version, changed_at, changed_by, reason')
    .eq('meerkat_id', meerkat)
    .order('changed_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data ?? [] });
}
```

- [ ] **Step 2: Smoke test**

```bash
curl http://localhost:3000/api/admin/versiones/nia/history \
  -H "Cookie: Centinelia_admin=$ADMIN_SECRET"
```

Esperado: `{ "history": [ ... ] }` con las entradas del activate del Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/versiones/\[meerkat\]/history/
git commit -m "feat(api): GET /admin/versiones/:meerkat/history"
```

---

## Task 8: Admin API — PATCH pin-version en agente

**Files:**
- Create: `src/app/api/admin/agentes/[id]/pin-version/route.ts`

**Interfaces:**
- Consumes: `voice_agents.features` JSONB, `MEERKAT_CONFIGS` (para validación)
- Produces: `PATCH /api/admin/agentes/:id/pin-version` — body `{ pinned_version: number | null }` (null = quitar pin) → 200 `{ ok, features }` | 400 | 401 | 404

- [ ] **Step 1: Crear el route**

Crear `src/app/api/admin/agentes/[id]/pin-version/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

interface Params { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const pinnedVersion = body.pinned_version as number | null | undefined;

  if (pinnedVersion !== null && (typeof pinnedVersion !== 'number' || !Number.isInteger(pinnedVersion) || pinnedVersion < 1)) {
    return NextResponse.json({ error: 'pinned_version must be an integer >= 1, or null to unpin' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: agent, error: fetchErr } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  // Validar que la versión existe en el bundle para el meerkat del agente
  if (pinnedVersion !== null && pinnedVersion !== undefined) {
    const meerkatId = (agent.features as any)?.meerkat_role_id;
    if (!meerkatId) {
      return NextResponse.json({ error: 'Agent has no meerkat_role_id — cannot pin' }, { status: 400 });
    }
    const versions = MEERKAT_CONFIGS[meerkatId];
    if (!versions?.[pinnedVersion]) {
      return NextResponse.json({
        error: `Version ${pinnedVersion} does not exist for meerkat ${meerkatId}. Available: ${Object.keys(versions ?? {}).join(', ')}`,
      }, { status: 400 });
    }
  }

  // Merge features: null quita el pin
  const newFeatures = { ...(agent.features as Record<string, unknown>) };
  if (pinnedVersion === null) delete newFeatures.pinned_meerkat_version;
  else newFeatures.pinned_meerkat_version = pinnedVersion;

  const { error: updErr } = await supabase
    .from('voice_agents')
    .update({ features: newFeatures })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Resync a Vapi para que el assistant refleje la nueva versión inmediatamente
  if (agent.vapi_agent_id) {
    const { data: refreshed } = await supabase.from('voice_agents').select('*').eq('id', id).single();
    if (refreshed) {
      updateVapiAssistant(agent.vapi_agent_id, refreshed as VoiceAgent).catch(err => {
        console.error('[pin-version] resync failed', { id, error: err.message });
      });
    }
  }

  return NextResponse.json({ ok: true, features: newFeatures });
}
```

- [ ] **Step 2: Smoke test**

```bash
# Pin
curl -X PATCH "http://localhost:3000/api/admin/agentes/<some-agent-id>/pin-version" \
  -H "Content-Type: application/json" \
  -H "Cookie: Centinelia_admin=$ADMIN_SECRET" \
  -d '{"pinned_version": 1}'

# Unpin
curl -X PATCH "http://localhost:3000/api/admin/agentes/<some-agent-id>/pin-version" \
  -H "Content-Type: application/json" \
  -H "Cookie: Centinelia_admin=$ADMIN_SECRET" \
  -d '{"pinned_version": null}'

# Version inválida → 400
curl -X PATCH "http://localhost:3000/api/admin/agentes/<some-agent-id>/pin-version" \
  -H "Content-Type: application/json" \
  -H "Cookie: Centinelia_admin=$ADMIN_SECRET" \
  -d '{"pinned_version": 999}'
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/agentes/\[id\]/pin-version/
git commit -m "feat(api): PATCH pin-version on agent features"
```

---

## Task 9: /admin/versiones page — tabla + ActivateVersionModal

**Files:**
- Create: `src/app/admin/versiones/page.tsx` (server component)
- Create: `src/components/admin/VersionesTable.tsx` (client component)
- Create: `src/components/admin/ActivateVersionModal.tsx` (client component)

**Interfaces:**
- Consumes: `GET /api/admin/versiones` (Task 6), `POST /api/admin/versiones/:meerkat/activate` (Task 6)
- Produces: página server-rendered en `/admin/versiones` con tabla y modal funcional.

- [ ] **Step 1: Server page (fetch inicial + shell)**

Crear `src/app/admin/versiones/page.tsx`:

```typescript
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { VersionesTable } from '@/components/admin/VersionesTable';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function VersionesPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const supabase = createAdminClient();

  const { data: activeRows } = await supabase
    .from('meerkat_active_versions')
    .select('meerkat_id, active_version, activated_at, activated_by, notes')
    .order('meerkat_id');

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('active', true);

  const agentCounts = new Map<string, number>();
  const pinnedCounts = new Map<string, number>();
  for (const a of agents ?? []) {
    const mId = (a.features as any)?.meerkat_role_id;
    if (!mId) continue;
    agentCounts.set(mId, (agentCounts.get(mId) ?? 0) + 1);
    if ((a.features as any)?.pinned_meerkat_version != null) {
      pinnedCounts.set(mId, (pinnedCounts.get(mId) ?? 0) + 1);
    }
  }

  const rows = (activeRows ?? []).map(r => ({
    meerkat_id: r.meerkat_id,
    active_version: r.active_version,
    activated_at: r.activated_at,
    activated_by: r.activated_by,
    notes: r.notes,
    available_versions: Object.keys(MEERKAT_CONFIGS[r.meerkat_id] ?? {}).map(Number).sort((a, b) => a - b),
    agent_count: agentCounts.get(r.meerkat_id) ?? 0,
    pinned_count: pinnedCounts.get(r.meerkat_id) ?? 0,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Versiones de meerkats</h1>
        <p className="text-sm text-slate-600 mt-1">
          Cada meerkat corre en la versión activa listada. Rollback = activar versión anterior. Cambios propagan en ≤60s + resync a Vapi.
        </p>
      </div>
      <VersionesTable rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: VersionesTable client component (tabla + botones)**

Crear `src/components/admin/VersionesTable.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { GitBranch, History, ArrowRight } from 'lucide-react';
import { ActivateVersionModal } from './ActivateVersionModal';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';

interface Row {
  meerkat_id: string;
  active_version: number;
  activated_at: string;
  activated_by: string | null;
  notes: string | null;
  available_versions: number[];
  agent_count: number;
  pinned_count: number;
}

export function VersionesTable({ rows }: { rows: Row[] }) {
  const [modalRow, setModalRow] = useState<Row | null>(null);
  const [historyMeerkat, setHistoryMeerkat] = useState<string | null>(null);

  return (
    <>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Meerkat</th>
              <th className="text-left px-4 py-3">Activa</th>
              <th className="text-left px-4 py-3">Última activación</th>
              <th className="text-left px-4 py-3">Agentes</th>
              <th className="text-left px-4 py-3">Disponibles</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.meerkat_id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{r.meerkat_id}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                    <GitBranch className="w-3 h-3" /> v{r.active_version}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {new Date(r.activated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.activated_by && <span className="text-slate-400"> · {r.activated_by}</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {r.agent_count}
                  {r.pinned_count > 0 && (
                    <span className="text-slate-400 text-xs"> ({r.agent_count - r.pinned_count} latest, {r.pinned_count} pinned)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {r.available_versions.map(v => (
                    <span key={v} className={`inline-block px-1.5 py-0.5 mr-1 rounded ${v === r.active_version ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      v{v}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.available_versions.length > 1 && (
                    <button
                      onClick={() => setModalRow(r)}
                      className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 mr-1"
                    >
                      Cambiar versión <ArrowRight className="inline w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setHistoryMeerkat(r.meerkat_id)}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <History className="inline w-3 h-3" /> Historial
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalRow && (
        <ActivateVersionModal
          row={modalRow}
          onClose={() => setModalRow(null)}
          onSuccess={() => { setModalRow(null); window.location.reload(); }}
        />
      )}
      {historyMeerkat && (
        <VersionHistoryDrawer
          meerkatId={historyMeerkat}
          onClose={() => setHistoryMeerkat(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: ActivateVersionModal**

Crear `src/components/admin/ActivateVersionModal.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Row {
  meerkat_id: string;
  active_version: number;
  activated_at: string;
  available_versions: number[];
  agent_count: number;
  pinned_count: number;
}

interface Props {
  row: Row;
  onClose: () => void;
  onSuccess: () => void;
}

export function ActivateVersionModal({ row, onClose, onSuccess }: Props) {
  const otherVersions = row.available_versions.filter(v => v !== row.active_version);
  const [selectedVersion, setSelectedVersion] = useState<number>(otherVersions[0] ?? row.active_version);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/versiones/${row.meerkat_id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selectedVersion, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  const affectedAgents = row.agent_count - row.pinned_count;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Activar versión — {row.meerkat_id}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-sm">
            <div className="text-slate-600">Versión activa actual: <span className="font-medium text-slate-900">v{row.active_version}</span></div>
            <div className="text-slate-600">Última activación: {new Date(row.activated_at).toLocaleString('es-MX')}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Nueva versión</label>
            <select
              value={selectedVersion}
              onChange={e => setSelectedVersion(Number(e.target.value))}
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
            >
              {otherVersions.map(v => (
                <option key={v} value={v}>v{v}</option>
              ))}
            </select>
          </div>

          <div className="text-sm bg-slate-50 rounded p-3">
            <div className="text-slate-700">Agentes que verán el cambio: <span className="font-medium">{affectedAgents}</span></div>
            {row.pinned_count > 0 && (
              <div className="text-slate-500 text-xs mt-1">
                {row.pinned_count} agente(s) protegidos por pin — no reciben el cambio.
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 mb-1 block">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ej. rollback por score bajo"
              className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm"
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded">Cancelar</button>
          <button onClick={submit} disabled={submitting} className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50">
            {submitting ? 'Activando…' : `Activar v${selectedVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Smoke test manual**

Abrir `http://localhost:3000/admin/versiones` con cookie admin. Verificar:
- Se renderizan las 10 filas.
- Click "Cambiar versión" abre el modal con dropdown de versiones disponibles.
- Sin más de 1 versión disponible, el botón "Cambiar versión" no aparece.
- Enviar activa la versión → recarga la página → nueva versión aparece como activa.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/versiones/ src/components/admin/VersionesTable.tsx src/components/admin/ActivateVersionModal.tsx
git commit -m "feat(admin): /admin/versiones page + activate modal"
```

---

## Task 10: VersionHistoryDrawer

**Files:**
- Create: `src/components/admin/VersionHistoryDrawer.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/versiones/:meerkat/history` (Task 7)
- Produces: drawer lateral con timeline. Usado por `VersionesTable`.

- [ ] **Step 1: Componente**

Crear `src/components/admin/VersionHistoryDrawer.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { X, GitBranch } from 'lucide-react';

interface HistoryEntry {
  id: string;
  from_version: number | null;
  to_version: number;
  changed_at: string;
  changed_by: string | null;
  reason: string | null;
}

export function VersionHistoryDrawer({ meerkatId, onClose }: { meerkatId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/versiones/${meerkatId}/history`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        setEntries(data.history);
      })
      .catch(err => setError((err as Error).message));
  }, [meerkatId]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Historial — {meerkatId}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {entries === null && !error && <div className="text-sm text-slate-500">Cargando…</div>}
          {entries && entries.length === 0 && <div className="text-sm text-slate-500">Sin cambios registrados.</div>}
          {entries && entries.length > 0 && (
            <ul className="space-y-3">
              {entries.map(e => (
                <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                  <div className="text-xs text-slate-500">
                    {new Date(e.changed_at).toLocaleString('es-MX')}
                    {e.changed_by && <span> · {e.changed_by}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm">
                    {e.from_version != null && <span className="text-slate-600">v{e.from_version}</span>}
                    {e.from_version != null && <span className="text-slate-400">→</span>}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-medium">
                      <GitBranch className="w-3 h-3" /> v{e.to_version}
                    </span>
                    {e.reason && <span className="text-xs text-slate-500 italic">— {e.reason}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke test**

Con el modal de activate ya activo del task anterior, click en "Historial". Debe abrir el drawer y mostrar los flips previos.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/VersionHistoryDrawer.tsx
git commit -m "feat(admin): version history drawer"
```

---

## Task 11: Versión tab en ficha del agente

**Files:**
- Create: `src/components/admin/AgentVersionTab.tsx`
- Modify: `src/app/admin/agentes/[id]/page.tsx` (renderizar el componente)

**Interfaces:**
- Consumes: `MEERKAT_CONFIGS` (Task 4), `PATCH /api/admin/agentes/:id/pin-version` (Task 8), `meerkat_active_versions` (Task 1) para saber la versión "efectiva"
- Produces: bloque UI en la página del agente que permite ver la versión efectiva y setear/quitar pin.

- [ ] **Step 1: Componente**

Crear `src/components/admin/AgentVersionTab.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Pin, PinOff, GitBranch } from 'lucide-react';

interface Props {
  agentId: string;
  meerkatId: string | null;
  availableVersions: number[];
  activeGlobalVersion: number | null;
  pinnedVersion: number | null;
}

export function AgentVersionTab({ agentId, meerkatId, availableVersions, activeGlobalVersion, pinnedVersion: initialPin }: Props) {
  const [pin, setPin] = useState<number | null>(initialPin);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<number>(initialPin ?? activeGlobalVersion ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!meerkatId) {
    return (
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm text-slate-600">
        Este agente no tiene meerkat_role_id asignado. No aplica versioning.
      </div>
    );
  }

  const effectiveVersion = pin ?? activeGlobalVersion ?? availableVersions[availableVersions.length - 1];

  async function save(newPin: number | null) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agentes/${agentId}/pin-version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned_version: newPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPin(newPin);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-4 h-4 text-slate-500" />
        <h3 className="font-medium text-slate-900">Versión del meerkat</h3>
      </div>

      <div className="text-sm text-slate-600 mb-3">
        Meerkat: <span className="font-medium text-slate-800">{meerkatId}</span>
        {' · '}Versión efectiva: <span className="font-medium text-slate-800">v{effectiveVersion}</span>
        {pin != null
          ? <span className="ml-2 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"><Pin className="w-3 h-3" /> PIN activo</span>
          : <span className="ml-2 text-xs text-slate-500">(siguiendo latest global v{activeGlobalVersion})</span>
        }
      </div>

      {!editing && (
        <div className="flex gap-2">
          <button
            onClick={() => { setPending(pin ?? activeGlobalVersion ?? 1); setEditing(true); }}
            className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {pin != null ? 'Cambiar pin' : 'Fijar en versión específica'}
          </button>
          {pin != null && (
            <button
              onClick={() => save(null)}
              disabled={submitting}
              className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <PinOff className="inline w-3 h-3" /> Quitar pin
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <select
            value={pending}
            onChange={e => setPending(Number(e.target.value))}
            className="border border-slate-200 rounded px-2 py-1 text-sm"
          >
            {availableVersions.map(v => <option key={v} value={v}>v{v}</option>)}
          </select>
          <button
            onClick={() => save(pending)}
            disabled={submitting}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null); }}
            disabled={submitting}
            className="text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Integrar en la página del agente**

Modificar `src/app/admin/agentes/[id]/page.tsx`. Cerca de donde se renderizan otros bloques del agente, agregar:

```typescript
// Fetch active global version del meerkat del agente
const meerkatId = (agent.features as any)?.meerkat_role_id ?? null;
let activeGlobalVersion: number | null = null;
if (meerkatId) {
  const { data } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkatId)
    .maybeSingle();
  activeGlobalVersion = data?.active_version ?? null;
}
const availableVersions = meerkatId ? Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number).sort((a, b) => a - b) : [];
const pinnedVersion = (agent.features as any)?.pinned_meerkat_version ?? null;

// … dentro del JSX, cerca de otros bloques de config:
<AgentVersionTab
  agentId={agent.id}
  meerkatId={meerkatId}
  availableVersions={availableVersions}
  activeGlobalVersion={activeGlobalVersion}
  pinnedVersion={pinnedVersion}
/>
```

Imports en la página:
```typescript
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { AgentVersionTab } from '@/components/admin/AgentVersionTab';
```

- [ ] **Step 3: Smoke test**

Abrir la ficha de un agente admin. Verificar:
- Se ve la sección "Versión del meerkat" con el meerkat correcto.
- Sin pin: muestra "siguiendo latest global vN".
- Click "Fijar en versión específica" → dropdown → guarda → banner cambia a "PIN activo".
- Click "Quitar pin" → banner vuelve a "siguiendo latest global".

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AgentVersionTab.tsx src/app/admin/agentes/\[id\]/page.tsx
git commit -m "feat(admin): version pin controls on agent detail page"
```

---

## Task 12: Admin sidebar entry

**Files:**
- Modify: sidebar admin (buscar con `grep -r "admin/dashboard" src/components/` o donde se listen las rutas admin — típico en `AdminSidebar.tsx` o layout admin)

**Interfaces:**
- Produces: enlace "Versiones" en el sidebar admin, apuntando a `/admin/versiones`, icono `GitBranch`.

- [ ] **Step 1: Localizar el sidebar**

```bash
grep -rn "admin/dashboard" src/components/ src/app/admin/
```

Probablemente hay un componente `AdminSidebar.tsx` o similar. Si el layout admin lista las rutas inline, editar `src/app/admin/layout.tsx`.

- [ ] **Step 2: Agregar entry**

Añadir un item en la lista de navegación:

```typescript
import { GitBranch } from 'lucide-react';

// … dentro del array de items o JSX:
{ href: '/admin/versiones', label: 'Versiones', icon: GitBranch },
```

Colocarlo cerca de "Configuración" o al final del grupo de settings.

- [ ] **Step 3: Verificar visual**

Abrir cualquier página admin. La entrada "Versiones" debe aparecer en el sidebar y navegar correctamente.

- [ ] **Step 4: Commit**

```bash
git add src/components/  # ajustar path al que se haya modificado
git commit -m "feat(admin): sidebar entry for /admin/versiones"
```

---

## Task 13: Deploy + post-deploy verification

**Files:**
- Create: `docs/runbooks/meerkat-versioning-deploy.md`

**Interfaces:**
- Produces: runbook con checklist de deploy y verificación post-deploy.

- [ ] **Step 1: Runbook**

Crear `docs/runbooks/meerkat-versioning-deploy.md`:

```markdown
# Runbook — Model + Prompt Versioning Deploy

## Pre-deploy checklist

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npx tsx scripts/verify-vapi-assistants-snapshot.ts` → "All snapshots match"
- [ ] `psql "$SUPABASE_DB_URL" -f migrations/20260730_meerkat_versioning.sql` en STAGING primero
- [ ] `psql "$SUPABASE_DB_URL" -f sql/tests/meerkat_versioning.verify.sql` en STAGING → 10 filas todas en v1
- [ ] Smoke `/admin/versiones` en staging: tabla renderiza, activate a v1 (no-op) responde 200
- [ ] Smoke pin en staging: seleccionar agente demo, pin en v1, unpin

## Deploy prod

1. Correr migration prod:
   ```
   psql "$SUPABASE_PROD_DB_URL" -f migrations/20260730_meerkat_versioning.sql
   ```
2. Verificar seed:
   ```
   psql "$SUPABASE_PROD_DB_URL" -f sql/tests/meerkat_versioning.verify.sql
   ```
3. Vercel deploy de main.

## Post-deploy verification

- [ ] `curl` a `/api/admin/versiones` en prod → 10 meerkats, todos en v1
- [ ] Trigger 1 llamada a agente demo (o esperar 1 llamada real) → outcome normal en `voice_calls`
- [ ] Revisar logs Vercel de las siguientes 2h: sin warnings `[resolve-meerkat] stale active_version` o errores nuevos
- [ ] Monitor diario (`/centinelia-monitor` o cron) del día siguiente sin anomalías

## Rollback plan si sale mal

Si el refactor introduce regresión:
1. Vercel: promote deploy previo.
2. La tabla `meerkat_active_versions` puede quedarse — no molesta al código viejo (que no la lee).
3. Investigar en staging antes de re-deploy.

## Primer uso real después de deploy

Cuando quieras probar un modelo nuevo (ej. Opus 4.7 en Nia):
1. Agregar `NIA_CONFIGS[2] = { ... }` en `src/lib/vapi/meerkat-configs.ts`.
2. Commit + push + deploy Vercel.
3. `/admin/versiones` → click "Cambiar versión" en Nia → seleccionar v2 → activar.
4. Esperar ≤60s, verificar en monitor.
5. Si degrada: `/admin/versiones` → activar v1 (rollback en un click).
```

- [ ] **Step 2: Ejecutar checklist**

Correr los pasos del runbook en orden. Anotar cualquier discrepancia y agregar al runbook.

- [ ] **Step 3: Commit y merge a main**

```bash
git add docs/runbooks/meerkat-versioning-deploy.md
git commit -m "docs(runbook): meerkat versioning deploy checklist"
git push origin main  # o el flujo de PR habitual del repo
```

- [ ] **Step 4: Actualizar la memoria del proyecto (post-implementación)**

Agregar entrada nueva al índice `MEMORY.md` de Nazre y crear archivo `decisions_centinelia_session45.md` (o el siguiente número disponible) resumiendo:
- Tablas creadas y su shape
- Ruta admin nueva
- Nuevo campo `pinned_meerkat_version`
- Referencia al spec y al plan

Esto lo hace Nazre en la sesión de reflexión post-deploy, no el implementador — solo dejar recordatorio.

---

## Self-review (autor del plan)

**Cobertura del spec:**
- Arquitectura (Sección 1 del spec) → Task 1 (tablas), Task 4 (resolver + configs). ✓
- Data flow (Sección 2) → APIs Task 6, 7, 8 + UI Task 9, 10, 11. ✓
- Portal admin UI (Sección 3) → Task 9 (tabla + modal), Task 10 (historial), Task 11 (pin), Task 12 (sidebar). ✓
- Migración (Sección 4) → Task 1 (migration), Task 2 (snapshot), Task 4 (refactor), Task 13 (deploy). ✓
- Error handling (Sección 5) → E1-E4 cubiertos en Task 4 (resolver), E7 cubierto en Task 5 (resync) + Task 6 (fire-and-forget). E5 (cache stale) documentado en constraints. E6 (cambio meerkat_role_id limpia pin) NO cubierto en este plan — se deja para follow-up separado ya que requiere tocar el PATCH agent handler existente.
- Testing (Sección 6) → Test 1 en Task 2 + Task 4. Test 2 en Task 4 step 6 (smoke tsx). Test 3 en Tasks 6-8 smoke con curl. Test 4 (integration completo) NO se automatiza — se cubre implícitamente en el runbook Task 13. Test 5 (UI) en tasks de UI. Test 6 en runbook.

**Placeholders / red flags:**
- Todos los code blocks son ejecutables. No hay "TBD", "handle appropriately", "similar to".
- Path del sidebar admin (Task 12) requiere localización con grep — es explícito, no un handwave.

**Consistency:**
- `MeerkatModelConfig` type: definido en `meerkat-configs.ts`, importado desde `resolve-meerkat.ts` y `sync.ts`. Consistente.
- `pinned_meerkat_version` como number | null: consistente en type (Task 3), resolver (Task 4), API (Task 8), UI (Task 11).
- `MEERKAT_CONFIGS` name consistente.
- `clearMeerkatVersionCache` exportado en Task 4 step 2, usado en Task 6.
- Cookie name `Centinelia_admin` consistente entre APIs y pages (Task 6, 7, 8, 9).

**Gap identificado:** E6 (cambio de meerkat_role_id debe limpiar pin) requiere tocar el PATCH del agent handler existente que no está en este plan. Anotar como follow-up:

> **Follow-up ticket:** Cuando el admin cambia `meerkat_role_id` de un agente vía PATCH, el handler debe limpiar `pinned_meerkat_version` (pin es semánticamente per-meerkat). Requiere editar `src/app/api/admin/agentes/[id]/route.ts` para detectar el cambio de meerkat y hacer `features = jsonb - 'pinned_meerkat_version'`. No bloquea el MVP porque es un edge case; abrir issue post-deploy.

---

**Estimación total:** 12 tasks. ~5-8 días implementación (más rápido que el spec estimaba 2 semanas porque la UI es más liviana de lo pensado y no hay tests unitarios que escribir).
