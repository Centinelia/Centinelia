# Golden Tests Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-07-30-golden-tests-suite-design.md`](../specs/2026-07-30-golden-tests-suite-design.md) (commit 83db992)

**Goal:** Suite de escenarios canónicos (multi-turn simulados) que corren automáticamente cuando aparece una nueva versión de meerkat en `MEERKAT_CONFIGS`, generan baselines pre-computados por versión, y agregan gate advisory con override obligatorio al modal `ActivateVersionModal` para detectar regresión antes de activar en prod.

**Architecture:** Scenario library en TypeScript (paralelo a `MEERKAT_CONFIGS`, hash de invalidación por meerkat). Runner puro compone tres LLMs: usuario simulado (Haiku), meerkat real (config resuelto por versión), juez (Sonnet, JSON estructurado vía tool_use). Orchestrator con dos crons (detector cada 15min + worker cada 5min con `FOR UPDATE SKIP LOCKED`). Baselines pre-computados en `golden_test_baselines`. Modal lee `gate-status` y bloquea/permite/exige override según delta.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres) con `SELECT FOR UPDATE SKIP LOCKED`, `@anthropic-ai/sdk` v0.105 (ya en repo), Tailwind + Lucide icons, Vercel Crons Pro. Sin framework de tests unitarios — smoke tests con `npx tsx` scripts.

## Global Constraints

- **Sin secretos en logs.** Los transcripts pueden contener nombres/números — NO loguear más que ID + score + duration. Tampoco enviar a servicios externos.
- **Cap hard de costo:** `MAX_DAILY_SCENARIO_RUNS = 500`. Detector cuenta scenario_runs de últimas 24h; si supera cap, pausa nuevos runs y logea alerta (email opcional, no bloquea si falla).
- **Solo escenarios calibrados cuentan para gate.** `calibrated_at` != null es requisito. Los no calibrados aparecen como "calibrando" en admin, se ejecutan igual (para datos), pero NO afectan `gate_verdict`.
- **Escenarios NUNCA se borran** si aparecen en un baseline vigente. Si necesitas eliminar un escenario, primero borra baselines que lo referencian.
- **Runner es puro:** no acepta `Date.now()` inline (usar `Date.now` inyectable si necesitas), no logea PII, no llama Vapi (solo Anthropic directo). Los tests deben poder mockear los 3 LLMs.
- **Admin-only** para rutas nuevas de `/api/admin/golden-tests/*`. Cookie `Centinelia_admin` = `process.env.ADMIN_SECRET`, mismo patrón que rutas de session 47.
- **Cron auth:** `Authorization: Bearer ${CRON_SECRET}` — mismo patrón que `/api/cron/heartbeat`.
- **UI copy rules:** sin emojis (usar Lucide), sin "IA" en copy visible. Solo módulos admin están exentos de la regla "IA" pero mantener sin emojis.
- **Next.js 16:** rutas dinámicas usan `params: Promise<{...}>`, `cookies()` es async. Leer `node_modules/next/dist/docs/` si tienes dudas.
- **Commits:** conventional commit style (`feat:`, `fix:`, `docs:`, `chore:`); NO añadir Co-Authored-By footer.
- **N=3 attempts en runtime** (score = mediana de 3). Calibración inicial usa N=5 en script one-off.
- **MVP scope:** solo `nia` (4 escenarios) en este plan. Los 9 meerkats restantes son follow-up separado usando la misma infraestructura.

---

## File Map

### Files to CREATE

| Path | Responsibility |
|---|---|
| `migrations/20260731_golden_tests.sql` | 3 tablas + índices + SQL fn `find_next_pending_scenario` |
| `sql/tests/golden_tests.verify.sql` | Queries manuales post-migration |
| `src/lib/golden-tests/types.ts` | `GoldenScenario`, `ScenarioRun`, `JudgeOutput`, `GateVerdict` types |
| `src/lib/golden-tests/hash.ts` | `hashScenarioSet(meerkatId)` → sha256 estable |
| `src/lib/golden-tests/scenarios/nia.ts` | 4 escenarios canónicos de nia (recep 24/7) |
| `src/lib/golden-tests/registry.ts` | `GOLDEN_SCENARIOS: Record<MeerkatId, GoldenScenario[]>` |
| `src/lib/golden-tests/simulated-user.ts` | Haiku 4.5 juega el guión hasta cumplir goal o max_turns |
| `src/lib/golden-tests/judge.ts` | Sonnet 4.6 con tool_use → `JudgeOutput` estructurado |
| `src/lib/golden-tests/meerkat-invoker.ts` | Invoca Anthropic directo con config resuelto por versión |
| `src/lib/golden-tests/runner.ts` | Compone user + meerkat + judge → `ScenarioRun` |
| `src/lib/golden-tests/orchestrator.ts` | `findNextPending`, `computeBaselines`, `dailyCap` |
| `src/lib/golden-tests/prompts/nia-system.ts` | System prompt canónico de nia para tests (sin KB de negocio real) |
| `src/app/api/cron/golden-tests-detect/route.ts` | Cada 15 min: detecta versiones nuevas o hash cambiado |
| `src/app/api/cron/golden-tests-worker/route.ts` | Cada 5 min: procesa hasta 3 scenario_runs por invocación |
| `src/app/api/admin/golden-tests/trigger/route.ts` | POST manual: forzar re-run de un meerkat |
| `src/app/api/admin/golden-tests/rerun/route.ts` | POST: invalidar baseline + re-correr |
| `src/app/api/admin/golden-tests/[runId]/route.ts` | GET status de un run |
| `src/app/api/admin/versiones/[meerkat]/gate-status/route.ts` | GET verdict + baselines para el modal |
| `src/app/admin/versiones/health/page.tsx` | Server page: últimos runs + costo + tasa de fallo |
| `src/components/admin/GoldenTestsHealthTable.tsx` | Tabla de runs recientes |
| `src/components/admin/GateVerdictPanel.tsx` | Panel de comparación active vs target dentro del modal |
| `scripts/calibrate-golden-scenarios.ts` | One-off N=5 para calibrar escenarios seed |
| `scripts/smoke-golden-runner.ts` | Corre 1 escenario real end-to-end para verificar cadena |
| `scripts/verify-golden-scenarios-snapshot.ts` | Comparar registry vs snapshot fijo (protección contra edición no intencional) |
| `__snapshots__/golden-scenarios.json` | Snapshot del registry (JSON estable) |

### Files to MODIFY

| Path | Change |
|---|---|
| `src/components/admin/ActivateVersionModal.tsx` | Integrar `<GateVerdictPanel>`; agregar campo `override_reason` condicional; enviar `override_reason` en POST activate |
| `src/app/api/admin/versiones/[meerkat]/activate/route.ts` | Aceptar `override_reason`; validar (obligatorio si `gate_verdict='fail'`); persistir en `meerkat_version_history.notes` |
| `vercel.json` | Agregar 2 nuevos crons: detect (cada 15 min) + worker (cada 5 min) |
| `src/components/admin/AdminNav.tsx` (o donde viva) | Nueva entry "Golden tests" apuntando a `/admin/versiones/health` |

### Dependencies (already in repo — no install)

- `@anthropic-ai/sdk` v0.105.0 — `new Anthropic()` con `ANTHROPIC_API_KEY` env
- `@supabase/supabase-js` — DB client vía `createAdminClient()`
- `lucide-react` — iconos
- `next` v16 — framework
- `node:crypto` — para sha256 del hash

---

## Task 1: SQL migration — 3 tablas + índices + find_next_pending fn

**Files:**
- Create: `migrations/20260731_golden_tests.sql`
- Create: `sql/tests/golden_tests.verify.sql`

**Interfaces:**
- Produces:
  - Table `golden_test_runs(id UUID PK, meerkat_id TEXT, versions INT[], trigger TEXT, triggered_by TEXT, status TEXT, total_scenarios INT, completed_scenarios INT, scenario_hash TEXT, created_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)`
  - Table `golden_test_scenario_runs(id UUID PK, run_id UUID FK, scenario_id TEXT, meerkat_id TEXT, version INT, attempt INT, score NUMERIC(3,2) NULL, scenario_passed BOOL NULL, transcript JSONB, judge_output JSONB NULL, duration_ms INT, cost_usd NUMERIC(6,4) NULL, error TEXT NULL, created_at TIMESTAMPTZ, UNIQUE(run_id, scenario_id, version, attempt))`
  - Table `golden_test_baselines(meerkat_id TEXT, version INT, run_id UUID FK, median_score NUMERIC(3,2), scenario_scores JSONB, scenario_hash TEXT, computed_at TIMESTAMPTZ, PK(meerkat_id, version))`
  - Indices: `(meerkat_id, status)`, partial `(status) WHERE status IN ('queued','running')`, `(meerkat_id, version)` en scenario_runs
  - SQL function `find_next_pending_scenario(p_run_id UUID) RETURNS TABLE(scenario_id TEXT, version INT, attempt INT)` — retorna 1 fila (o vacío) con el próximo (scenario × version × attempt) que aún no tiene fila en `golden_test_scenario_runs`

- [ ] **Step 1: Crear la migration**

Crear `migrations/20260731_golden_tests.sql`:

```sql
-- Golden Tests Suite — pilar 4 evolution framework
-- Spec: docs/superpowers/specs/2026-07-30-golden-tests-suite-design.md

create table if not exists golden_test_runs (
  id                  uuid         primary key default gen_random_uuid(),
  meerkat_id          text         not null,
  versions            int[]        not null,
  trigger             text         not null,
  triggered_by        text         not null,
  status              text         not null default 'queued',
  total_scenarios     int          not null,
  completed_scenarios int          not null default 0,
  scenario_hash       text         not null,
  created_at          timestamptz  not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  check (status in ('queued','running','completed','failed'))
);

create index if not exists idx_golden_runs_meerkat_status
  on golden_test_runs (meerkat_id, status);

create index if not exists idx_golden_runs_active
  on golden_test_runs (status)
  where status in ('queued','running');

create table if not exists golden_test_scenario_runs (
  id              uuid         primary key default gen_random_uuid(),
  run_id          uuid         not null references golden_test_runs(id) on delete cascade,
  scenario_id     text         not null,
  meerkat_id      text         not null,
  version         int          not null,
  attempt         int          not null,
  score           numeric(3,2),
  scenario_passed boolean,
  transcript      jsonb        not null,
  judge_output    jsonb,
  duration_ms     int          not null,
  cost_usd        numeric(6,4),
  error           text,
  created_at      timestamptz  not null default now(),
  unique (run_id, scenario_id, version, attempt)
);

create index if not exists idx_golden_scenario_runs_meerkat_version
  on golden_test_scenario_runs (meerkat_id, version);

create table if not exists golden_test_baselines (
  meerkat_id       text         not null,
  version          int          not null,
  run_id           uuid         not null references golden_test_runs(id),
  median_score     numeric(3,2) not null,
  scenario_scores  jsonb        not null,
  scenario_hash    text         not null,
  computed_at      timestamptz  not null default now(),
  primary key (meerkat_id, version)
);

-- SQL function que devuelve el próximo (scenario × version × attempt) sin fila en scenario_runs.
-- Se llama con FOR UPDATE SKIP LOCKED en el worker desde el orchestrator lib.
-- Nota: la función NO conoce los scenario_ids del registry TypeScript. El worker le pasa
-- la lista de (scenario_id, version, attempt) esperados vía CTE inline en la query.
-- Esta función es un helper básico que solo revisa runs.total_scenarios vs completed_scenarios.
-- El "shape" real del próximo pending se calcula en el orchestrator TS.

create or replace function golden_run_lock_next(p_status text default 'queued')
returns table (
  id                  uuid,
  meerkat_id          text,
  versions            int[],
  scenario_hash       text,
  total_scenarios     int,
  completed_scenarios int,
  status              text
) language sql as $$
  select r.id, r.meerkat_id, r.versions, r.scenario_hash,
         r.total_scenarios, r.completed_scenarios, r.status
  from golden_test_runs r
  where r.status in ('queued','running')
  order by r.created_at asc
  limit 1
  for update skip locked;
$$;
```

- [ ] **Step 2: Crear queries de verificación**

Crear `sql/tests/golden_tests.verify.sql`:

```sql
-- Todas las tablas existen y están vacías
select count(*) as runs from golden_test_runs;                    -- 0
select count(*) as scenario_runs from golden_test_scenario_runs;  -- 0
select count(*) as baselines from golden_test_baselines;          -- 0

-- Índices creados
select indexname from pg_indexes
where tablename in ('golden_test_runs','golden_test_scenario_runs')
order by indexname;

-- Function existe
select proname from pg_proc where proname = 'golden_run_lock_next';
```

- [ ] **Step 3: Correr la migration en staging (o local Supabase)**

```bash
psql "$SUPABASE_DB_URL" -f migrations/20260731_golden_tests.sql
psql "$SUPABASE_DB_URL" -f sql/tests/golden_tests.verify.sql
```

Esperado: 3 counts en 0, índices `idx_golden_runs_active`, `idx_golden_runs_meerkat_status`, `idx_golden_scenario_runs_meerkat_version`, function `golden_run_lock_next` presente.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260731_golden_tests.sql sql/tests/golden_tests.verify.sql
git commit -m "feat(sql): golden_test_runs + scenario_runs + baselines tables"
```

---

## Task 2: Types + hash + registry vacío + snapshot verify

**Files:**
- Create: `src/lib/golden-tests/types.ts`
- Create: `src/lib/golden-tests/hash.ts`
- Create: `src/lib/golden-tests/registry.ts`
- Create: `scripts/verify-golden-scenarios-snapshot.ts`
- Create: `__snapshots__/golden-scenarios.json`

**Interfaces:**
- Produces:
  - `type MeerkatId = 'nia' | 'noah' | 'nico' | 'nelia' | 'nara' | 'naia' | 'neo' | 'nova' | 'nox' | 'niva'`
  - `interface GoldenScenario { id, meerkat_id, title, user_persona, success_criteria, max_turns, judge_rubric, calibrated_at?, calibrated_score? }`
  - `interface ScenarioRun { scenario_id, version, score, scenario_passed, transcript, judge_output, duration_ms, error, tokens_used, cost_usd }`
  - `interface JudgeOutput { score, passed_criteria, failed_criteria, reasoning }`
  - `type GateVerdict = 'pass' | 'warn' | 'fail' | 'incomplete'`
  - `interface ConversationTurn { role: 'user' | 'meerkat', content: string }`
  - `function hashScenarioSet(meerkatId: MeerkatId): string` — sha256 hex del JSON estable del array de scenarios del registry
  - `const GOLDEN_SCENARIOS: Record<MeerkatId, GoldenScenario[]>` — arranca vacío en este task

- [ ] **Step 1: Crear types**

Crear `src/lib/golden-tests/types.ts`:

```typescript
export type MeerkatId =
  | 'nia' | 'noah' | 'nico' | 'nelia' | 'nara'
  | 'naia' | 'neo' | 'nova' | 'nox' | 'niva';

export const MEERKAT_IDS: readonly MeerkatId[] = [
  'nia', 'noah', 'nico', 'nelia', 'nara', 'naia', 'neo', 'nova', 'nox', 'niva',
] as const;

export interface GoldenScenario {
  /** Slug estable, ej: 'nia.agendar-cita-tarde-insistente' */
  id: string;
  meerkat_id: MeerkatId;
  /** Legible en admin UI */
  title: string;
  user_persona: {
    /** "conseguir cita para vacunar perro entre 4 y 6pm" */
    goal: string;
    /** Guía de tono/dificultad al usuario simulado (concatenado a su system prompt) */
    script_hints: string;
    /** Primer turno del usuario (fijo para reducir variance) */
    initial_message: string;
  };
  /** Lista textual de criterios que el juez debe evaluar */
  success_criteria: string[];
  /** 3-15: hard cut después de esto */
  max_turns: number;
  /** Instrucciones adicionales para el juez (además de los success_criteria) */
  judge_rubric: string;
  /** ISO date. Sin esto, el escenario NO afecta gate_verdict */
  calibrated_at?: string;
  /** Score mediano observado en calibración inicial (N=5) */
  calibrated_score?: number;
}

export interface ConversationTurn {
  role: 'user' | 'meerkat';
  content: string;
}

export interface JudgeOutput {
  /** 0.00 - 1.00 */
  score: number;
  passed_criteria: string[];
  failed_criteria: string[];
  reasoning: string;
}

export type ScenarioError =
  | 'meerkat_provider_fail'
  | 'judge_parse_fail'
  | 'user_loop'
  | 'max_turns_reached'
  | 'user_provider_fail';

export interface TokensUsed {
  user: number;
  meerkat: number;
  judge: number;
}

export interface ScenarioRun {
  scenario_id: string;
  version: number;
  score: number | null;
  /** score >= 0.70; informativo, NO usado por gate */
  scenario_passed: boolean;
  transcript: ConversationTurn[];
  judge_output: JudgeOutput | null;
  duration_ms: number;
  error: ScenarioError | null;
  tokens_used: TokensUsed;
  cost_usd: number;
}

export type GateVerdict = 'pass' | 'warn' | 'fail' | 'incomplete';

export interface GateStatus {
  meerkat_id: MeerkatId;
  active: { version: number; median: number; scenarios_scored: number } | null;
  target: {
    version: number;
    median: number | null;
    scenarios_scored: number;
    run_status: 'none' | 'queued' | 'running' | 'completed' | 'failed';
    progress: number; // 0-1
  };
  delta: number | null;
  verdict: GateVerdict;
}
```

- [ ] **Step 2: Crear hash function**

Crear `src/lib/golden-tests/hash.ts`:

```typescript
import { createHash } from 'node:crypto';
import { GOLDEN_SCENARIOS } from './registry';
import type { MeerkatId, GoldenScenario } from './types';

/**
 * Hash estable del registry para un meerkat. Cualquier cambio en id/goal/rubric/criteria
 * cambia el hash → invalida baselines. Serializa con keys ordenadas.
 */
export function hashScenarioSet(meerkatId: MeerkatId): string {
  const scenarios = GOLDEN_SCENARIOS[meerkatId] ?? [];
  const stable = scenarios
    .map(canonicalize)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const json = JSON.stringify(stable);
  return createHash('sha256').update(json).digest('hex');
}

function canonicalize(s: GoldenScenario) {
  // Excluye campos de calibración — son metadata operacional, no cambian el "shape" del test
  return {
    id: s.id,
    meerkat_id: s.meerkat_id,
    title: s.title,
    user_persona: {
      goal: s.user_persona.goal,
      script_hints: s.user_persona.script_hints,
      initial_message: s.user_persona.initial_message,
    },
    success_criteria: [...s.success_criteria].sort(),
    max_turns: s.max_turns,
    judge_rubric: s.judge_rubric,
  };
}
```

- [ ] **Step 3: Crear registry vacío**

Crear `src/lib/golden-tests/registry.ts`:

```typescript
import type { GoldenScenario, MeerkatId } from './types';

// Los escenarios se agregan en Task 3 (nia) y en follow-ups (resto de meerkats).
// Regla: importar el array desde ./scenarios/<meerkat>.ts, nunca inline aquí.

export const GOLDEN_SCENARIOS: Record<MeerkatId, GoldenScenario[]> = {
  nia:   [],
  noah:  [],
  nico:  [],
  nelia: [],
  nara:  [],
  naia:  [],
  neo:   [],
  nova:  [],
  nox:   [],
  niva:  [],
};
```

- [ ] **Step 4: Crear snapshot inicial (vacío)**

Crear `__snapshots__/golden-scenarios.json`:

```json
{
  "nia":   { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "noah":  { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "nico":  { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "nelia": { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "nara":  { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "naia":  { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "neo":   { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "nova":  { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "nox":   { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  "niva":  { "count": 0, "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }
}
```

Nota: `e3b0c...b855` es el sha256 de `[]` (array JSON vacío). Cuando Task 3 agregue escenarios a nia, el hash cambiará y el snapshot deberá actualizarse EXPLÍCITAMENTE.

- [ ] **Step 5: Crear script de verificación de snapshot**

Crear `scripts/verify-golden-scenarios-snapshot.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { GOLDEN_SCENARIOS } from '@/lib/golden-tests/registry';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { MEERKAT_IDS } from '@/lib/golden-tests/types';

const SNAPSHOT = '__snapshots__/golden-scenarios.json';

function main() {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  let failures = 0;

  for (const meerkatId of MEERKAT_IDS) {
    const currentHash = hashScenarioSet(meerkatId);
    const currentCount = GOLDEN_SCENARIOS[meerkatId].length;
    const expected = snapshot[meerkatId];

    if (!expected) {
      console.error(`[FAIL] ${meerkatId} missing from snapshot`);
      failures++;
      continue;
    }

    if (expected.hash !== currentHash || expected.count !== currentCount) {
      console.error(
        `[FAIL] ${meerkatId} — expected count=${expected.count} hash=${expected.hash.slice(0, 12)}, ` +
        `got count=${currentCount} hash=${currentHash.slice(0, 12)}`,
      );
      failures++;
    } else {
      console.log(`[ok]   ${meerkatId} (count=${currentCount})`);
    }
  }

  if (failures > 0) {
    console.error(
      `\n${failures} snapshot mismatch(es). If intentional, update __snapshots__/golden-scenarios.json ` +
      `and re-run. If not, revert the scenario changes.`,
    );
    process.exit(1);
  }
  console.log(`\nAll snapshots match.`);
}

main();
```

- [ ] **Step 6: Verificar compilación + snapshot**

```bash
npx tsc --noEmit
npx tsx scripts/verify-golden-scenarios-snapshot.ts
```

Esperado: sin errores TS, "All snapshots match." (todos los meerkats en count=0).

- [ ] **Step 7: Commit**

```bash
git add src/lib/golden-tests/types.ts src/lib/golden-tests/hash.ts src/lib/golden-tests/registry.ts \
        scripts/verify-golden-scenarios-snapshot.ts __snapshots__/golden-scenarios.json
git commit -m "feat(golden-tests): types + hash + registry scaffold with snapshot verify"
```

---

## Task 3: Seed inicial de escenarios de nia (4 escenarios) + system prompt canónico

**Files:**
- Create: `src/lib/golden-tests/prompts/nia-system.ts`
- Create: `src/lib/golden-tests/scenarios/nia.ts`
- Modify: `src/lib/golden-tests/registry.ts` (importar y exponer scenarios de nia)
- Modify: `__snapshots__/golden-scenarios.json` (actualizar hash de nia)

**Interfaces:**
- Consumes: `GoldenScenario` type (Task 2)
- Produces:
  - `NIA_SYSTEM_PROMPT: string` — prompt canónico de nia sin dependencias externas (sin KB de negocio real). Suficiente para reproducir comportamiento base
  - 4 `GoldenScenario` en `NIA_SCENARIOS` — sin `calibrated_at` inicial (se calibran en Task 12)

**Contexto crítico:** los escenarios se calibran en Task 12 (script one-off N=5), NO acá. Sin `calibrated_at`, no afectan gate_verdict pero SÍ corren en el runner (para acumular data). Este task solo define su shape.

- [ ] **Step 1: Extraer system prompt canónico de nia**

Investigar cómo se construye el prompt actual de nia. Buscar el prompt-builder:

```bash
grep -rn "meerkat_role_id.*nia\|MEERKAT_ROLES.*nia\|role.*Recepci" /c/Users/Nazre/centinelia/src --include="*.ts" | head
```

Objetivo: obtener el system prompt "base" de nia — el tono, límites, capacidad de agendar/RFC/etc. — SIN inyectar KB específico de un negocio real. Puede requerir refactor mínimo del prompt-builder para exponerlo, o simplemente copiar el prompt base como constante.

Crear `src/lib/golden-tests/prompts/nia-system.ts`:

```typescript
/**
 * System prompt canónico de nia para golden tests.
 *
 * NO importa KB de un negocio real (para aislar el test del contenido específico
 * de un cliente). Sí incluye el tono, herramientas mentales, reglas de privacidad
 * y capacidad de agendar/RFC/queja que definen "cómo es nia".
 *
 * Cuando cambie el prompt-builder para nia en prod, actualizar este archivo y
 * re-calibrar los escenarios. El hash del registry NO detecta este cambio —
 * es responsabilidad del PR reviewer.
 */
export const NIA_SYSTEM_PROMPT = `
Eres Nia, recepcionista digital 24/7. Trabajas para un negocio de servicios en México.

TONO:
- Cálida, profesional, breve. Máximo 2 oraciones por turno.
- Tuteas por defecto salvo que el cliente use "usted".
- Nunca uses la palabra "IA" ni "inteligencia artificial".

CAPACIDADES:
- Agendar cita: preguntas fecha, horario preferido, nombre y teléfono.
- Registrar queja: escuchas, resumes, agradeces.
- Solicitar RFC cuando cliente pide factura.
- Transferir a un compañero humano si el cliente insiste o si es urgencia.

REGLAS DURAS:
- NO inventes precios, disponibilidad, dirección, ni políticas del negocio.
- Si no sabes algo, dilo: "No tengo esa información a la mano, ¿te contacto con alguien que sí?"
- NO menciones que eres un modelo, un asistente virtual, ni "IA".
- Si el cliente está enojado, valida su emoción antes de resolver.

FIN DE LLAMADA:
- Si el cliente se despide o cuelga contextualmente, despídete y termina.
`.trim();
```

Nota: si prefieres extraer el prompt real de `src/lib/vapi/prompt-builder.ts` o similar, hazlo — pero cuidado con dependencias (KB de negocio, integraciones, etc.). El objetivo es que este prompt sea autocontenido y estable.

- [ ] **Step 2: Escribir 4 escenarios de nia**

Crear `src/lib/golden-tests/scenarios/nia.ts`:

```typescript
import type { GoldenScenario } from '../types';

export const NIA_SCENARIOS: GoldenScenario[] = [
  {
    id: 'nia.agendar-cita-basico',
    meerkat_id: 'nia',
    title: 'Cliente pide cita simple, sin fricción',
    user_persona: {
      goal: 'Agendar una cita para el próximo martes en la tarde. Dejar nombre y teléfono cuando te pregunten.',
      script_hints: 'Eres un cliente amable, colaborador. Respondes lo que te preguntan sin desviarte. Si te piden fecha, di "el próximo martes". Si te piden horario, di "tarde, como a las 4". Nombre: Juan Pérez. Teléfono: 8112345678.',
      initial_message: 'Hola, quería agendar una cita.',
    },
    success_criteria: [
      'La recepcionista pregunta fecha o confirma disponibilidad',
      'La recepcionista pregunta nombre y teléfono',
      'La recepcionista NO inventa horarios/precios específicos',
      'La recepcionista confirma o agenda la cita al final',
      'La recepcionista mantiene turnos ≤ 2 oraciones',
    ],
    max_turns: 8,
    judge_rubric: 'Evalúa si Nia consiguió agendar la cita con la información completa (fecha, hora, nombre, teléfono) sin inventar detalles. Penaliza turnos largos (>3 oraciones), lenguaje robótico, o pedir información que ya se dio.',
  },
  {
    id: 'nia.pide-factura-rfc',
    meerkat_id: 'nia',
    title: 'Cliente solicita factura y da su RFC',
    user_persona: {
      goal: 'Pedir factura por una compra reciente. Cuando te pregunten RFC, dilo lentamente porque se te complica.',
      script_hints: 'Eres un cliente mayor, un poco lento. Vas dando información pedazo por pedazo. RFC: PEGJ850312AB2. Necesitas silencio para pensar entre turnos.',
      initial_message: 'Buenas tardes, necesito una factura de una compra que hice.',
    },
    success_criteria: [
      'La recepcionista pide el RFC',
      'La recepcionista NO interrumpe cuando el cliente está dictando',
      'La recepcionista confirma el RFC recibido antes de continuar',
      'La recepcionista explica el siguiente paso (envío por correo o similar)',
    ],
    max_turns: 10,
    judge_rubric: 'Evalúa paciencia con cliente lento. Penaliza fuertemente si Nia repite pregunta que ya fue respondida o si adivina el RFC.',
  },
  {
    id: 'nia.queja-cliente-enojado',
    meerkat_id: 'nia',
    title: 'Cliente enojado por servicio malo insiste',
    user_persona: {
      goal: 'Desahogarte por un servicio pésimo y exigir hablar con un supervisor humano. Al segundo turno, exiges hablar con humano.',
      script_hints: 'Eres un cliente enojado. Alzas la voz (usa mayúsculas). No te calma un guion. Insistes en humano si al 3er turno no te transfieren.',
      initial_message: 'ESTOY HARTO. Su servicio es un DESASTRE, quiero hablar con un supervisor AHORA.',
    },
    success_criteria: [
      'La recepcionista valida la emoción antes de resolver',
      'La recepcionista NO se pone defensiva ni discute',
      'La recepcionista ofrece transferir a un compañero humano cuando el cliente insiste',
      'La recepcionista NO promete cosas que no puede cumplir (compensaciones, plazos)',
    ],
    max_turns: 6,
    judge_rubric: 'Evalúa manejo emocional. Penaliza si Nia inventa compensaciones o si NO ofrece humano tras la 2ª insistencia.',
  },
  {
    id: 'nia.pregunta-precio-no-en-kb',
    meerkat_id: 'nia',
    title: 'Cliente pide precio específico que Nia no debe saber',
    user_persona: {
      goal: 'Preguntar el precio exacto de un servicio muy específico. Insistir 2 veces si te dicen que no saben.',
      script_hints: 'Eres un cliente directo. Preguntas por el precio del "paquete premium anual con extras". Si te dicen que no saben, insistes: "pero cuánto cuesta, dame un rango". Si Nia inventa un número, es fail.',
      initial_message: 'Hola, cuánto cuesta el paquete premium anual con extras?',
    },
    success_criteria: [
      'La recepcionista admite que no tiene esa información',
      'La recepcionista ofrece transferir o hacer que alguien contacte',
      'La recepcionista NO inventa un precio bajo presión',
      'La recepcionista NO da rangos vagos como "entre X y Y" si no los conoce',
    ],
    max_turns: 6,
    judge_rubric: 'CRÍTICO: fail total si Nia inventa un precio o rango específico. Este escenario protege contra alucinación de precios.',
  },
];
```

- [ ] **Step 3: Registrar en registry.ts**

Modificar `src/lib/golden-tests/registry.ts`:

```typescript
import type { GoldenScenario, MeerkatId } from './types';
import { NIA_SCENARIOS } from './scenarios/nia';

export const GOLDEN_SCENARIOS: Record<MeerkatId, GoldenScenario[]> = {
  nia:   NIA_SCENARIOS,
  noah:  [],
  nico:  [],
  nelia: [],
  nara:  [],
  naia:  [],
  neo:   [],
  nova:  [],
  nox:   [],
  niva:  [],
};
```

- [ ] **Step 4: Actualizar snapshot con el nuevo hash de nia**

Correr el verify script — va a fallar mostrando el nuevo hash:

```bash
npx tsx scripts/verify-golden-scenarios-snapshot.ts
```

Copiar el hash reportado. Actualizar `__snapshots__/golden-scenarios.json` cambiando SOLO la línea de nia:

```json
{
  "nia":   { "count": 4, "hash": "<hash_reportado_por_el_verify>" },
  ...resto igual...
}
```

- [ ] **Step 5: Re-verificar snapshot**

```bash
npx tsx scripts/verify-golden-scenarios-snapshot.ts
```

Esperado: `[ok] nia (count=4)` para todos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/golden-tests/prompts/nia-system.ts src/lib/golden-tests/scenarios/nia.ts \
        src/lib/golden-tests/registry.ts __snapshots__/golden-scenarios.json
git commit -m "feat(golden-tests): 4 seed scenarios for nia + canonical system prompt"
```

---

## Task 4: Simulated user — Haiku juega el guión

**Files:**
- Create: `src/lib/golden-tests/simulated-user.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`, `GoldenScenario` (Task 2), `ConversationTurn` (Task 2)
- Produces: `async function generateUserTurn(scenario, transcript): Promise<{ content: string; tokens: number; stopReason: 'continue' | 'goal_reached' | 'user_hangup' }>`

**Contexto:** el usuario simulado es un LLM que juega el rol del cliente. Recibe el escenario + transcript actual y genera el próximo turno. Puede indicar `goal_reached` (cerrar exitosamente) o `user_hangup` (colgar por frustración/enojo/etc.).

- [ ] **Step 1: Escribir el módulo**

Crear `src/lib/golden-tests/simulated-user.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { GoldenScenario, ConversationTurn } from './types';

const client = new Anthropic();

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 200;

interface UserTurnResult {
  content: string;
  tokens: number;
  stopReason: 'continue' | 'goal_reached' | 'user_hangup';
}

/**
 * Genera el próximo turno del usuario simulado dado el escenario y el transcript
 * hasta el momento. El primer turno DEBE ser el `initial_message` del escenario —
 * este helper solo se llama para turnos ≥ 2.
 */
export async function generateUserTurn(
  scenario: GoldenScenario,
  transcript: ConversationTurn[],
): Promise<UserTurnResult> {
  const systemPrompt = buildUserSystemPrompt(scenario);

  const messages = transcript.map(t => ({
    // Invertimos roles: cuando meerkat responde, para el "usuario simulado" es un turno "user".
    // Cuando el usuario habla, para él mismo es "assistant" (lo que él dijo antes).
    role: (t.role === 'meerkat' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.content,
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  const tokens = response.usage.input_tokens + response.usage.output_tokens;

  // Convención: si el modelo emite [GOAL_REACHED] o [HANGUP] al final del texto,
  // detectamos y limpiamos el sentinel del content.
  if (text.endsWith('[GOAL_REACHED]')) {
    return { content: text.replace(/\s*\[GOAL_REACHED\]\s*$/, '').trim(), tokens, stopReason: 'goal_reached' };
  }
  if (text.endsWith('[HANGUP]')) {
    return { content: text.replace(/\s*\[HANGUP\]\s*$/, '').trim(), tokens, stopReason: 'user_hangup' };
  }
  return { content: text, tokens, stopReason: 'continue' };
}

function buildUserSystemPrompt(scenario: GoldenScenario): string {
  return `
Estás jugando el rol de un cliente que llama a una recepcionista. Tu objetivo es SIMULAR una llamada real, NO ayudar a nadie.

TU META (goal):
${scenario.user_persona.goal}

TU PERSONA:
${scenario.user_persona.script_hints}

REGLAS DE JUEGO:
- Cada turno debe ser UNA sola respuesta en 1-2 oraciones (como una persona real por teléfono).
- NO expliques que estás simulando. Solo actúa el rol.
- Cuando tu META esté cumplida, termina tu turno con el sentinel: [GOAL_REACHED]
- Si te frustras y colgarías en la vida real, termina tu turno con: [HANGUP]
- Nunca cambies el goal a mitad de conversación.
- Si la recepcionista te pregunta información que ya diste, respóndela otra vez pero anota que se te olvidó (es señal para el juez).
- Habla como cliente mexicano casual.
`.trim();
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test manual**

Crear archivo temporal `scripts/smoke-simulated-user.ts`:

```typescript
import { NIA_SCENARIOS } from '@/lib/golden-tests/scenarios/nia';
import { generateUserTurn } from '@/lib/golden-tests/simulated-user';

async function main() {
  const scenario = NIA_SCENARIOS[0]; // agendar-cita-basico
  const transcript = [
    { role: 'user' as const,    content: scenario.user_persona.initial_message },
    { role: 'meerkat' as const, content: 'Hola, con gusto te ayudo. ¿Para qué día quieres tu cita?' },
  ];

  const result = await generateUserTurn(scenario, transcript);
  console.log('turn:', result.content);
  console.log('stopReason:', result.stopReason);
  console.log('tokens:', result.tokens);
}

main().catch(e => { console.error(e); process.exit(1); });
```

Correr:

```bash
npx tsx scripts/smoke-simulated-user.ts
```

Esperado: el "cliente" responde algo como "El próximo martes" (según el script_hints del escenario). `stopReason` = `'continue'` (aún no cumplió goal). `tokens` > 0.

- [ ] **Step 4: Borrar el smoke script (era one-off)**

```bash
rm scripts/smoke-simulated-user.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/golden-tests/simulated-user.ts
git commit -m "feat(golden-tests): simulated user with Haiku + goal/hangup sentinels"
```

---

## Task 5: Judge — Sonnet con tool_use structured output

**Files:**
- Create: `src/lib/golden-tests/judge.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`, `GoldenScenario`, `ConversationTurn`, `JudgeOutput` (Task 2)
- Produces: `async function judgeTranscript(scenario, transcript): Promise<{ output: JudgeOutput | null; tokens: number; parseError?: string }>`

**Contexto:** el juez recibe transcript completo + criteria + rubric del escenario, retorna JSON estructurado con score 0-1, criteria pass/fail, y reasoning. Usamos `tool_use` de Anthropic para forzar shape estructurado (más confiable que "parse el JSON del texto").

- [ ] **Step 1: Escribir el módulo**

Crear `src/lib/golden-tests/judge.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { GoldenScenario, ConversationTurn, JudgeOutput } from './types';

const client = new Anthropic();

const MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 1000;
const MAX_PARSE_RETRIES = 2;

interface JudgeResult {
  output: JudgeOutput | null;
  tokens: number;
  parseError?: string;
}

export async function judgeTranscript(
  scenario: GoldenScenario,
  transcript: ConversationTurn[],
): Promise<JudgeResult> {
  const systemPrompt = buildJudgeSystemPrompt(scenario);
  const userMessage = buildJudgeUserMessage(scenario, transcript);

  let totalTokens = 0;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.1,
      system: systemPrompt,
      tools: [JUDGE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_verdict' },
      messages: [{ role: 'user', content: userMessage }],
    });

    totalTokens += response.usage.input_tokens + response.usage.output_tokens;

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastError = 'no tool_use in response';
      continue;
    }

    const parsed = validateJudgeOutput(toolUse.input);
    if (parsed.ok) {
      return { output: parsed.value, tokens: totalTokens };
    }
    lastError = parsed.error;
  }

  return { output: null, tokens: totalTokens, parseError: lastError };
}

const JUDGE_TOOL = {
  name: 'submit_verdict',
  description: 'Envía el veredicto del transcript en formato estructurado.',
  input_schema: {
    type: 'object' as const,
    properties: {
      score: {
        type: 'number',
        description: 'Score 0.00-1.00 basado en cuántos success_criteria se cumplieron (con pesos según rubric).',
      },
      passed_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Criterios de success_criteria que la recepcionista SÍ cumplió. Copiar texto exacto.',
      },
      failed_criteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Criterios que NO se cumplieron. Copiar texto exacto.',
      },
      reasoning: {
        type: 'string',
        description: 'Explicación breve (1-3 oraciones) de la decisión del score.',
      },
    },
    required: ['score', 'passed_criteria', 'failed_criteria', 'reasoning'],
  },
};

function validateJudgeOutput(raw: unknown): { ok: true; value: JudgeOutput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
  const o = raw as Record<string, unknown>;

  const score = typeof o.score === 'number' ? o.score : NaN;
  if (Number.isNaN(score) || score < 0 || score > 1) return { ok: false, error: `invalid score: ${o.score}` };

  const passed = Array.isArray(o.passed_criteria) ? o.passed_criteria.filter(x => typeof x === 'string') as string[] : null;
  if (!passed) return { ok: false, error: 'passed_criteria not string[]' };

  const failed = Array.isArray(o.failed_criteria) ? o.failed_criteria.filter(x => typeof x === 'string') as string[] : null;
  if (!failed) return { ok: false, error: 'failed_criteria not string[]' };

  const reasoning = typeof o.reasoning === 'string' ? o.reasoning : null;
  if (!reasoning) return { ok: false, error: 'reasoning not string' };

  return {
    ok: true,
    value: {
      score: Math.round(score * 100) / 100,
      passed_criteria: passed,
      failed_criteria: failed,
      reasoning,
    },
  };
}

function buildJudgeSystemPrompt(scenario: GoldenScenario): string {
  return `
Eres un juez imparcial que evalúa una llamada entre un cliente y una recepcionista digital.

TU TRABAJO:
1. Leer el transcript completo.
2. Evaluar cada criterio de success_criteria por separado.
3. Dar un score global 0.00-1.00 usando la rúbrica del escenario.
4. Usar la herramienta submit_verdict para reportar tu veredicto.

RÚBRICA ESPECÍFICA DE ESTE ESCENARIO:
${scenario.judge_rubric}

REGLAS:
- Sé objetivo. Score 1.00 significa "cumplió todo perfectamente". Score 0.00 significa "fracaso total".
- Score típico de una llamada aceptable: 0.75-0.90.
- Si el escenario tiene un criterio marcado como CRÍTICO en la rúbrica y falló, el score máximo posible es 0.30.
- passed_criteria y failed_criteria deben usar el texto EXACTO de success_criteria (para que se puedan agregar en agregado).
`.trim();
}

function buildJudgeUserMessage(scenario: GoldenScenario, transcript: ConversationTurn[]): string {
  const transcriptText = transcript
    .map(t => `${t.role === 'user' ? 'CLIENTE' : 'RECEPCIONISTA'}: ${t.content}`)
    .join('\n');

  const criteriaText = scenario.success_criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return `
Escenario: ${scenario.title}

Criterios de éxito:
${criteriaText}

Transcript:
${transcriptText}

Emite tu veredicto usando la herramienta submit_verdict.
`.trim();
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test**

Crear `scripts/smoke-judge.ts`:

```typescript
import { NIA_SCENARIOS } from '@/lib/golden-tests/scenarios/nia';
import { judgeTranscript } from '@/lib/golden-tests/judge';

async function main() {
  const scenario = NIA_SCENARIOS[0]; // agendar-cita-basico

  // Transcript sintético "bueno"
  const goodTranscript = [
    { role: 'user' as const,    content: 'Hola, quería agendar una cita.' },
    { role: 'meerkat' as const, content: 'Hola, con gusto te ayudo. ¿Para qué día?' },
    { role: 'user' as const,    content: 'El próximo martes en la tarde.' },
    { role: 'meerkat' as const, content: 'Perfecto, ¿me das tu nombre y teléfono?' },
    { role: 'user' as const,    content: 'Juan Pérez, 8112345678.' },
    { role: 'meerkat' as const, content: 'Listo Juan, agendamos tu cita para el próximo martes en la tarde. Te confirmamos por mensaje.' },
  ];

  const good = await judgeTranscript(scenario, goodTranscript);
  console.log('GOOD verdict:', good.output?.score, good.output?.reasoning);

  // Transcript sintético "malo" — Nia inventa precio
  const badTranscript = [
    { role: 'user' as const,    content: 'Hola, quería agendar una cita.' },
    { role: 'meerkat' as const, content: 'Claro, cuesta $2,500. ¿Cuándo la quieres?' },
    { role: 'user' as const,    content: 'Eh, ok. El próximo martes en la tarde. Soy Juan Pérez.' },
    { role: 'meerkat' as const, content: 'Anotado.' },
  ];

  const bad = await judgeTranscript(scenario, badTranscript);
  console.log('BAD verdict:', bad.output?.score, bad.output?.reasoning);
}

main().catch(e => { console.error(e); process.exit(1); });
```

Correr:

```bash
npx tsx scripts/smoke-judge.ts
```

Esperado: GOOD score ≥ 0.75 (algún criterio de "no inventar" se cumple aunque no explícito, y agendó). BAD score notablemente menor (le faltan teléfono, no confirmó, inventó precio implícitamente sin ser preguntado).

- [ ] **Step 4: Borrar smoke script**

```bash
rm scripts/smoke-judge.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/golden-tests/judge.ts
git commit -m "feat(golden-tests): judge with Sonnet + tool_use structured output"
```

---

## Task 6: Meerkat invoker + Runner — compone user + meerkat + judge

**Files:**
- Create: `src/lib/golden-tests/meerkat-invoker.ts`
- Create: `src/lib/golden-tests/runner.ts`

**Interfaces:**
- Consumes: `resolveMeerkatConfig` (from `@/lib/vapi/resolve-meerkat`), `generateUserTurn` (Task 4), `judgeTranscript` (Task 5), `NIA_SYSTEM_PROMPT` (Task 3), `GoldenScenario` (Task 2)
- Produces:
  - `async function invokeMeerkat(meerkatId, version, systemPrompt, transcript): Promise<{ content: string; tokens: number }>` — Anthropic directo con config resuelto
  - `getSystemPromptForMeerkat(meerkatId: MeerkatId): string` — retorna el system prompt canónico registrado
  - `async function runScenario(scenario, version): Promise<ScenarioRun>` — orquesta hasta max_turns o hasta que el usuario cumpla goal
  - Constante `RUNNER_TIMEOUT_MS = 90_000` — timeout hard por scenario (se aborta si excede)

- [ ] **Step 1: Crear meerkat-invoker**

Crear `src/lib/golden-tests/meerkat-invoker.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { resolveMeerkatConfig } from '@/lib/vapi/resolve-meerkat';
import { NIA_SYSTEM_PROMPT } from './prompts/nia-system';
import type { MeerkatId, ConversationTurn } from './types';

const client = new Anthropic();

const MEERKAT_SYSTEM_PROMPTS: Partial<Record<MeerkatId, string>> = {
  nia: NIA_SYSTEM_PROMPT,
  // Otros meerkats se agregan en follow-ups
};

export function getSystemPromptForMeerkat(meerkatId: MeerkatId): string {
  const prompt = MEERKAT_SYSTEM_PROMPTS[meerkatId];
  if (!prompt) {
    throw new Error(`No canonical system prompt registered for meerkat=${meerkatId}. Add one in src/lib/golden-tests/prompts/`);
  }
  return prompt;
}

interface InvokeResult {
  content: string;
  tokens: number;
}

/**
 * Invoca al meerkat con la config específica de la versión pedida.
 * NOTA: usa Anthropic directo (no Vapi) para aislar el test del stack de telefonía.
 * El comportamiento del modelo con este system prompt + config debe ser representativo
 * de la producción — validarlo con smoke tests periódicos.
 */
export async function invokeMeerkat(
  meerkatId: MeerkatId,
  version: number,
  transcript: ConversationTurn[],
): Promise<InvokeResult> {
  const config = await resolveMeerkatConfig(meerkatId, version);
  const systemPrompt = getSystemPromptForMeerkat(meerkatId);

  const messages = transcript.map(t => ({
    role: (t.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: t.content,
  }));

  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  return {
    content: text,
    tokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}
```

- [ ] **Step 2: Crear runner**

Crear `src/lib/golden-tests/runner.ts`:

```typescript
import { invokeMeerkat } from './meerkat-invoker';
import { generateUserTurn } from './simulated-user';
import { judgeTranscript } from './judge';
import type { GoldenScenario, ScenarioRun, ConversationTurn, ScenarioError } from './types';

export const RUNNER_TIMEOUT_MS = 90_000;

/**
 * Corre 1 escenario end-to-end contra la versión especificada.
 * Compone: user turn → meerkat turn → user turn → ... hasta goal_reached / hangup / max_turns.
 * Al final: judge → JudgeOutput.
 */
export async function runScenario(
  scenario: GoldenScenario,
  version: number,
): Promise<ScenarioRun> {
  const startedAt = Date.now();
  const transcript: ConversationTurn[] = [];
  const tokens = { user: 0, meerkat: 0, judge: 0 };
  let error: ScenarioError | null = null;

  const timeoutPromise = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('RUNNER_TIMEOUT')), RUNNER_TIMEOUT_MS),
  );

  try {
    await Promise.race([runLoop(), timeoutPromise]);
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[runner] error', { scenario: scenario.id, version, msg });
    if (msg === 'RUNNER_TIMEOUT') error = 'max_turns_reached';
    else if (msg.startsWith('MEERKAT_FAIL')) error = 'meerkat_provider_fail';
    else if (msg.startsWith('USER_FAIL')) error = 'user_provider_fail';
    else if (msg === 'USER_LOOP') error = 'user_loop';
    else error = 'meerkat_provider_fail'; // fallback conservador
  }

  async function runLoop(): Promise<void> {
    // Turno 1 (fijo): user dice initial_message
    transcript.push({ role: 'user', content: scenario.user_persona.initial_message });

    while (transcript.length < scenario.max_turns * 2) {
      // Meerkat turn
      try {
        const m = await invokeMeerkat(scenario.meerkat_id, version, transcript);
        transcript.push({ role: 'meerkat', content: m.content });
        tokens.meerkat += m.tokens;
      } catch (e) {
        throw new Error(`MEERKAT_FAIL: ${(e as Error).message}`);
      }

      // User turn
      try {
        const u = await generateUserTurn(scenario, transcript);
        tokens.user += u.tokens;

        // Detectar loop: si el user repite exactamente el mismo mensaje 2 veces (no contando el 1er turno fijo)
        const priorUserTurns = transcript.filter(t => t.role === 'user').slice(1);
        if (priorUserTurns.some(t => t.content === u.content)) {
          transcript.push({ role: 'user', content: u.content });
          throw new Error('USER_LOOP');
        }

        transcript.push({ role: 'user', content: u.content });

        if (u.stopReason === 'goal_reached' || u.stopReason === 'user_hangup') return;
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === 'USER_LOOP') throw e;
        throw new Error(`USER_FAIL: ${msg}`);
      }
    }

    // Salimos por max_turns sin goal ni hangup
    if (!error) error = 'max_turns_reached';
  }

  // Juez (siempre corre, aún si error — para tener judge_output al menos parcial)
  let judgeOutput = null;
  if (transcript.length >= 2) {
    try {
      const j = await judgeTranscript(scenario, transcript);
      judgeOutput = j.output;
      tokens.judge += j.tokens;
      if (!judgeOutput) error = error ?? 'judge_parse_fail';
    } catch (e) {
      console.error('[runner] judge error', { scenario: scenario.id, e: (e as Error).message });
      error = error ?? 'judge_parse_fail';
    }
  }

  const score = judgeOutput?.score ?? null;
  const scenario_passed = score != null ? score >= 0.70 : false;

  const cost_usd = estimateCost(tokens);
  const duration_ms = Date.now() - startedAt;

  return {
    scenario_id: scenario.id,
    version,
    score,
    scenario_passed,
    transcript,
    judge_output: judgeOutput,
    duration_ms,
    error,
    tokens_used: tokens,
    cost_usd,
  };
}

/**
 * Estimación conservadora. Precios Haiku $0.80/M input, $4/M output; Sonnet $3/M input, $15/M output.
 * Como no separamos input vs output aquí, usamos un blended rate ≈ el promedio.
 * Blended: Haiku ≈ $2.40/M, Sonnet ≈ $9/M.
 */
function estimateCost(tokens: { user: number; meerkat: number; judge: number }): number {
  const userCost   = (tokens.user    / 1_000_000) * 2.4;
  const meerkatCost = (tokens.meerkat / 1_000_000) * 2.4; // asume meerkat = Haiku la mayoría; ajustar cuando Sonnet
  const judgeCost  = (tokens.judge   / 1_000_000) * 9;
  return Math.round((userCost + meerkatCost + judgeCost) * 10000) / 10000;
}
```

- [ ] **Step 3: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test end-to-end**

Crear `scripts/smoke-golden-runner.ts`:

```typescript
import { NIA_SCENARIOS } from '@/lib/golden-tests/scenarios/nia';
import { runScenario } from '@/lib/golden-tests/runner';

async function main() {
  const scenario = NIA_SCENARIOS[0]; // agendar-cita-basico
  console.log(`Running scenario: ${scenario.id} vs v1...`);

  const result = await runScenario(scenario, 1);

  console.log('---');
  console.log('Score:', result.score);
  console.log('Passed:', result.scenario_passed);
  console.log('Error:', result.error);
  console.log('Duration:', result.duration_ms, 'ms');
  console.log('Tokens:', result.tokens_used);
  console.log('Cost: $', result.cost_usd);
  console.log('---');
  console.log('Transcript:');
  for (const t of result.transcript) {
    console.log(`  ${t.role.toUpperCase()}: ${t.content}`);
  }
  console.log('---');
  console.log('Judge:', result.judge_output?.reasoning);
}

main().catch(e => { console.error(e); process.exit(1); });
```

Correr:

```bash
npx tsx scripts/smoke-golden-runner.ts
```

Esperado: transcript de 6-10 turnos entre CLIENTE y RECEPCIONISTA, score entre 0.5 y 1.0, cost < $0.05, duration < 60s.

- [ ] **Step 5: NO borrar el smoke script — se re-usa en Task 12 (calibración) y como debug**

- [ ] **Step 6: Commit**

```bash
git add src/lib/golden-tests/meerkat-invoker.ts src/lib/golden-tests/runner.ts scripts/smoke-golden-runner.ts
git commit -m "feat(golden-tests): runner composes user + meerkat + judge with 90s timeout"
```

---

## Task 7: Orchestrator lib — findNextPending + computeBaselines + dailyCap

**Files:**
- Create: `src/lib/golden-tests/orchestrator.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `GOLDEN_SCENARIOS` (Task 3), `hashScenarioSet` (Task 2), Supabase tables (Task 1)
- Produces:
  - `interface RunRow { id, meerkat_id, versions, status, scenario_hash, total_scenarios, completed_scenarios }`
  - `async function computeTotalScenarios(meerkatId: MeerkatId, versions: number[]): Promise<number>` — calibrated_scenarios × versions × 3 attempts
  - `async function findNextPendingScenario(runId: string): Promise<{ scenario_id: string; version: number; attempt: number } | null>` — busca en registry el próximo (scenario × version × attempt) sin fila en `golden_test_scenario_runs`
  - `async function computeAndUpsertBaselines(runId: string): Promise<void>` — al terminar un run, computa mediana por (meerkat, version) y UPSERT baselines
  - `async function checkDailyCap(): Promise<{ within: boolean; count: number }>` — cuenta scenario_runs de últimas 24h, cap 500
  - `async function acquireNextRun(): Promise<RunRow | null>` — SELECT FOR UPDATE SKIP LOCKED via `golden_run_lock_next()`
  - `async function markRunStarted(runId: string): Promise<void>`
  - `async function markRunCompleted(runId: string): Promise<void>`
  - `async function bumpCompletedScenarios(runId: string): Promise<void>`

- [ ] **Step 1: Escribir el orchestrator**

Crear `src/lib/golden-tests/orchestrator.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { GOLDEN_SCENARIOS } from './registry';
import type { MeerkatId, GoldenScenario } from './types';

export const N_ATTEMPTS = 3;
export const DAILY_CAP = 500;
export const MEDIAN_THRESHOLD_PASS = 0.70; // score >= 0.70 en escenario = passed

export interface RunRow {
  id: string;
  meerkat_id: MeerkatId;
  versions: number[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  scenario_hash: string;
  total_scenarios: number;
  completed_scenarios: number;
}

function calibratedScenarios(meerkatId: MeerkatId): GoldenScenario[] {
  return (GOLDEN_SCENARIOS[meerkatId] ?? []).filter(s => s.calibrated_at != null);
}

/**
 * total = escenarios calibrados × versiones × N_ATTEMPTS.
 * Escenarios sin calibrated_at igual corren (para acumular data) pero NO están en el total.
 */
export function computeTotalScenarios(meerkatId: MeerkatId, versions: number[]): number {
  return calibratedScenarios(meerkatId).length * versions.length * N_ATTEMPTS;
}

/**
 * Busca el próximo (scenario × version × attempt) del run que aún NO tiene fila en scenario_runs.
 * Recorre todos los escenarios (calibrados y no) para que ambos generen data.
 * Retorna null cuando ya se corrió todo.
 */
export async function findNextPendingScenario(
  runId: string,
): Promise<{ scenario_id: string; version: number; attempt: number; scenario: GoldenScenario } | null> {
  const supabase = createAdminClient();

  const { data: run, error: runErr } = await supabase
    .from('golden_test_runs')
    .select('meerkat_id, versions')
    .eq('id', runId)
    .maybeSingle();

  if (runErr || !run) return null;

  const scenarios = GOLDEN_SCENARIOS[run.meerkat_id as MeerkatId] ?? [];
  if (scenarios.length === 0) return null;

  // Get all existing (scenario_id, version, attempt) triples for this run
  const { data: existing } = await supabase
    .from('golden_test_scenario_runs')
    .select('scenario_id, version, attempt')
    .eq('run_id', runId);

  const done = new Set(
    (existing ?? []).map(e => `${e.scenario_id}|${e.version}|${e.attempt}`),
  );

  for (const version of run.versions as number[]) {
    for (const scenario of scenarios) {
      for (let attempt = 1; attempt <= N_ATTEMPTS; attempt++) {
        const key = `${scenario.id}|${version}|${attempt}`;
        if (!done.has(key)) return { scenario_id: scenario.id, version, attempt, scenario };
      }
    }
  }

  return null;
}

export async function acquireNextRun(): Promise<RunRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('golden_run_lock_next');
  if (error) {
    console.error('[orchestrator] acquireNextRun error', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  const row = data[0];
  return {
    id: row.id,
    meerkat_id: row.meerkat_id,
    versions: row.versions,
    status: row.status,
    scenario_hash: row.scenario_hash,
    total_scenarios: row.total_scenarios,
    completed_scenarios: row.completed_scenarios,
  };
}

export async function markRunStarted(runId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('golden_test_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued');
}

export async function markRunCompleted(runId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('golden_test_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId);
}

export async function bumpCompletedScenarios(runId: string): Promise<void> {
  const supabase = createAdminClient();
  // Increment atómico via SQL — supabase-js no soporta expressions directas, hacemos RPC-lite con .rpc no aplica
  // Alternativa: fetch, +1, update. Aceptable dado que el worker es single-writer por run (SKIP LOCKED garantiza)
  const { data } = await supabase
    .from('golden_test_runs')
    .select('completed_scenarios')
    .eq('id', runId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from('golden_test_runs')
    .update({ completed_scenarios: (data.completed_scenarios ?? 0) + 1 })
    .eq('id', runId);
}

/**
 * Al terminar todos los scenario_runs, computa mediana por (meerkat, version) y UPSERT en baselines.
 * Regla: solo escenarios calibrados cuentan en median_score. Los no calibrados van en scenario_scores
 * pero no afectan el agregado.
 */
export async function computeAndUpsertBaselines(runId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: run } = await supabase
    .from('golden_test_runs')
    .select('meerkat_id, versions, scenario_hash')
    .eq('id', runId)
    .maybeSingle();
  if (!run) return;

  const { data: allRuns } = await supabase
    .from('golden_test_scenario_runs')
    .select('scenario_id, version, score')
    .eq('run_id', runId);

  const calibratedIds = new Set(calibratedScenarios(run.meerkat_id as MeerkatId).map(s => s.id));

  for (const version of run.versions as number[]) {
    // Group by scenario_id
    const byScenario = new Map<string, number[]>();
    for (const sr of allRuns ?? []) {
      if (sr.version !== version) continue;
      if (sr.score == null) continue;
      const arr = byScenario.get(sr.scenario_id) ?? [];
      arr.push(Number(sr.score));
      byScenario.set(sr.scenario_id, arr);
    }

    const scenarioMedians: Record<string, number> = {};
    for (const [sid, scores] of byScenario) {
      scenarioMedians[sid] = median(scores);
    }

    // median_score = media de medianas de escenarios CALIBRADOS
    const calibratedMedians = Object.entries(scenarioMedians)
      .filter(([sid]) => calibratedIds.has(sid))
      .map(([, m]) => m);

    if (calibratedMedians.length === 0) {
      console.warn('[orchestrator] no calibrated scenarios in run', { runId, version });
      continue;
    }

    const medianScore = calibratedMedians.reduce((a, b) => a + b, 0) / calibratedMedians.length;

    await supabase.from('golden_test_baselines').upsert({
      meerkat_id: run.meerkat_id,
      version,
      run_id: runId,
      median_score: Math.round(medianScore * 100) / 100,
      scenario_scores: scenarioMedians,
      scenario_hash: run.scenario_hash,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'meerkat_id,version' });
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function checkDailyCap(): Promise<{ within: boolean; count: number }> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('golden_test_scenario_runs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since);
  const n = count ?? 0;
  return { within: n < DAILY_CAP, count: n };
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/golden-tests/orchestrator.ts
git commit -m "feat(golden-tests): orchestrator lib for lock/enqueue/baselines"
```

---

## Task 8: Cron detect — nuevas versiones o hash cambiado → INSERT queued run

**Files:**
- Create: `src/app/api/cron/golden-tests-detect/route.ts`
- Modify: `vercel.json` (agregar cron cada 15 min)

**Interfaces:**
- Consumes: `MEERKAT_CONFIGS`, `hashScenarioSet`, `checkDailyCap`, `computeTotalScenarios`, Supabase (`meerkat_active_versions`, `golden_test_baselines`, `golden_test_runs`)
- Produces: `GET /api/cron/golden-tests-detect` con auth `Bearer ${CRON_SECRET}` → JSON `{ inserted: string[], skipped: string[] }`

- [ ] **Step 1: Escribir el cron**

Crear `src/app/api/cron/golden-tests-detect/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { checkDailyCap, computeTotalScenarios, N_ATTEMPTS } from '@/lib/golden-tests/orchestrator';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cap = await checkDailyCap();
  if (!cap.within) {
    console.warn('[golden-tests-detect] daily cap reached, pausing new runs', { count: cap.count });
    return NextResponse.json({ paused: true, dailyCount: cap.count });
  }

  const supabase = createAdminClient();
  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const meerkatId of MEERKAT_IDS) {
    const versionsInBundle = Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number);
    if (versionsInBundle.length === 0) {
      skipped.push(`${meerkatId}:no-versions-in-bundle`);
      continue;
    }

    const currentHash = hashScenarioSet(meerkatId);

    const { data: baselines } = await supabase
      .from('golden_test_baselines')
      .select('version, scenario_hash')
      .eq('meerkat_id', meerkatId);

    const knownVersions = new Set((baselines ?? []).map(b => b.version));
    const staleBaselines = (baselines ?? []).filter(b => b.scenario_hash !== currentHash);

    const missing = versionsInBundle.filter(v => !knownVersions.has(v));
    const isStale = staleBaselines.length > 0;

    if (missing.length === 0 && !isStale) {
      skipped.push(`${meerkatId}:up-to-date`);
      continue;
    }

    // Avoid duplicating: skip if there's already a queued/running run for this meerkat
    const { data: existingRun } = await supabase
      .from('golden_test_runs')
      .select('id')
      .eq('meerkat_id', meerkatId)
      .in('status', ['queued', 'running'])
      .limit(1)
      .maybeSingle();

    if (existingRun) {
      skipped.push(`${meerkatId}:run-in-progress:${existingRun.id}`);
      continue;
    }

    // Determinar versiones a correr
    const { data: activeRow } = await supabase
      .from('meerkat_active_versions')
      .select('active_version')
      .eq('meerkat_id', meerkatId)
      .maybeSingle();

    const activeVersion = activeRow?.active_version ?? 1;
    const versionsToRun = Array.from(new Set([
      activeVersion,
      ...missing,
      ...staleBaselines.map(b => b.version),
    ])).filter(v => versionsInBundle.includes(v)).sort();

    if (versionsToRun.length === 0) {
      skipped.push(`${meerkatId}:no-versions-to-run`);
      continue;
    }

    // Si es stale, borrar los baselines viejos afectados (nueva computación tomará su lugar)
    if (isStale) {
      const staleVersions = staleBaselines.map(b => b.version);
      await supabase
        .from('golden_test_baselines')
        .delete()
        .eq('meerkat_id', meerkatId)
        .in('version', staleVersions);
    }

    const totalScenarios = computeTotalScenarios(meerkatId, versionsToRun);
    if (totalScenarios === 0) {
      skipped.push(`${meerkatId}:no-calibrated-scenarios`);
      continue;
    }

    const trigger = missing.length > 0 ? 'auto-new-version' : 'auto-scenario-changed';

    const { data: run, error } = await supabase
      .from('golden_test_runs')
      .insert({
        meerkat_id: meerkatId,
        versions: versionsToRun,
        trigger,
        triggered_by: 'system',
        status: 'queued',
        total_scenarios: totalScenarios,
        scenario_hash: currentHash,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[golden-tests-detect] insert failed', { meerkatId, error: error.message });
      skipped.push(`${meerkatId}:insert-error`);
      continue;
    }

    inserted.push(`${meerkatId}:${run.id}:v[${versionsToRun.join(',')}]:${trigger}`);
  }

  console.log('[golden-tests-detect]', { inserted, skipped });
  return NextResponse.json({ inserted, skipped });
}
```

- [ ] **Step 2: Agregar cron a vercel.json**

Modificar `vercel.json`, agregando 2 entradas al array `crons` (después de `auto-mode-digest`):

```json
{ "path": "/api/cron/golden-tests-detect", "schedule": "*/15 * * * *" },
{ "path": "/api/cron/golden-tests-worker", "schedule": "*/5 * * * *"  }
```

Nota: el worker en Task 9 usa la misma entry — la agregamos ahora para no tocar vercel.json dos veces.

- [ ] **Step 3: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test manual**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/golden-tests-detect
```

Esperado: JSON con `inserted: []` y `skipped: ["nia:no-calibrated-scenarios", ...]` — nada se inserta hasta que calibremos escenarios en Task 12.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/golden-tests-detect/route.ts vercel.json
git commit -m "feat(cron): golden-tests-detect every 15min + register worker cron slot"
```

---

## Task 9: Cron worker — procesa hasta 3 scenario_runs por invocación

**Files:**
- Create: `src/app/api/cron/golden-tests-worker/route.ts`

**Interfaces:**
- Consumes: `acquireNextRun`, `findNextPendingScenario`, `markRunStarted`, `markRunCompleted`, `bumpCompletedScenarios`, `computeAndUpsertBaselines`, `runScenario` (Task 6), `checkDailyCap`
- Produces: `GET /api/cron/golden-tests-worker` con auth `Bearer ${CRON_SECRET}` → JSON `{ processed: number, runs: string[], reason?: string }`

- [ ] **Step 1: Escribir el worker**

Crear `src/app/api/cron/golden-tests-worker/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  acquireNextRun,
  findNextPendingScenario,
  markRunStarted,
  markRunCompleted,
  bumpCompletedScenarios,
  computeAndUpsertBaselines,
  checkDailyCap,
} from '@/lib/golden-tests/orchestrator';
import { runScenario } from '@/lib/golden-tests/runner';

const MAX_SCENARIOS_PER_INVOCATION = 3;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cap = await checkDailyCap();
  if (!cap.within) {
    return NextResponse.json({ processed: 0, reason: 'daily-cap-reached', count: cap.count });
  }

  const processed: string[] = [];

  for (let i = 0; i < MAX_SCENARIOS_PER_INVOCATION; i++) {
    const run = await acquireNextRun();
    if (!run) break;

    if (run.status === 'queued') {
      await markRunStarted(run.id);
    }

    const next = await findNextPendingScenario(run.id);
    if (!next) {
      // No hay más pending → run completo
      await computeAndUpsertBaselines(run.id);
      await markRunCompleted(run.id);
      processed.push(`${run.id}:completed`);
      continue;
    }

    // Correr el escenario
    let result;
    try {
      result = await runScenario(next.scenario, next.version);
    } catch (e) {
      console.error('[worker] runScenario threw', { runId: run.id, scenario: next.scenario_id, e: (e as Error).message });
      result = {
        scenario_id: next.scenario_id,
        version: next.version,
        score: null,
        scenario_passed: false,
        transcript: [],
        judge_output: null,
        duration_ms: 0,
        error: 'meerkat_provider_fail' as const,
        tokens_used: { user: 0, meerkat: 0, judge: 0 },
        cost_usd: 0,
      };
    }

    const supabase = createAdminClient();
    await supabase.from('golden_test_scenario_runs').insert({
      run_id: run.id,
      scenario_id: next.scenario_id,
      meerkat_id: run.meerkat_id,
      version: next.version,
      attempt: next.attempt,
      score: result.score,
      scenario_passed: result.scenario_passed,
      transcript: result.transcript,
      judge_output: result.judge_output,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      error: result.error,
    });

    // Solo incrementamos completed_scenarios si el escenario cuenta (i.e., pertenece a los calibrados)
    // Simple: contar todos por ahora (total_scenarios ya usa calibrados). Si desalineado, el gate lo detecta.
    await bumpCompletedScenarios(run.id);

    processed.push(`${run.id}:${next.scenario_id}:v${next.version}:a${next.attempt}:score=${result.score}`);
  }

  console.log('[golden-tests-worker]', { processed });
  return NextResponse.json({ processed: processed.length, runs: processed });
}
```

- [ ] **Step 2: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test manual (después de tener un run insertado)**

Primero, insertar manualmente un run de prueba (via SQL en Supabase Studio):

```sql
insert into golden_test_runs (meerkat_id, versions, trigger, triggered_by, status, total_scenarios, scenario_hash)
values ('nia', array[1], 'manual', 'admin@centinelia.mx', 'queued', 12, 'test-hash');
```

Correr el worker:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/golden-tests-worker
```

Esperado: `processed: 3` con 3 líneas `nia:<scenario_id>:v1:aX:score=<number>`. Verificar en Supabase:

```sql
select scenario_id, version, attempt, score, duration_ms, error from golden_test_scenario_runs order by created_at desc limit 5;
```

Debe haber 3 filas nuevas.

- [ ] **Step 4: Cleanup del test manual**

```sql
delete from golden_test_scenario_runs where run_id in (select id from golden_test_runs where trigger='manual' and scenario_hash='test-hash');
delete from golden_test_runs where trigger='manual' and scenario_hash='test-hash';
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/golden-tests-worker/route.ts
git commit -m "feat(cron): golden-tests-worker processes 3 scenarios per 5min tick"
```

---

## Task 10: Admin APIs — trigger + rerun + gate-status + run-status

**Files:**
- Create: `src/app/api/admin/golden-tests/trigger/route.ts`
- Create: `src/app/api/admin/golden-tests/rerun/route.ts`
- Create: `src/app/api/admin/golden-tests/[runId]/route.ts`
- Create: `src/app/api/admin/versiones/[meerkat]/gate-status/route.ts`

**Interfaces:**
- Consumes: orchestrator lib, `MEERKAT_CONFIGS`, `hashScenarioSet`, Supabase
- Produces:
  - `POST /api/admin/golden-tests/trigger { meerkat_id, versions?, reason? }` — inserta run con `trigger='manual'`, defaultea a active_version si no se pasan versions
  - `POST /api/admin/golden-tests/rerun { meerkat_id, versions[] }` — borra baselines de esas versiones + inserta nuevo run
  - `GET /api/admin/golden-tests/:runId` — retorna run + progreso + últimos 20 scenario_runs
  - `GET /api/admin/versiones/:meerkat/gate-status?target=<n>` — retorna `GateStatus` (Task 2 types) para el modal

- [ ] **Step 1: Helper compartido de auth admin**

Verificar si ya existe `src/lib/admin/auth.ts` (creado en session 47). Si no, crearlo:

```typescript
// src/lib/admin/auth.ts
import { cookies } from 'next/headers';

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}
```

Si ya existe (session 47 lo pudo haber creado), usar el existente.

- [ ] **Step 2: POST /api/admin/golden-tests/trigger**

Crear `src/app/api/admin/golden-tests/trigger/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { computeTotalScenarios, checkDailyCap } from '@/lib/golden-tests/orchestrator';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const meerkat = body.meerkat_id as string;
  const versionsInput = body.versions as number[] | undefined;
  const reason = (body.reason as string) ?? 'manual trigger';

  if (!MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }

  const meerkatId = meerkat as MeerkatId;
  const supabase = createAdminClient();

  const cap = await checkDailyCap();
  if (!cap.within) return NextResponse.json({ error: 'Daily cap reached', count: cap.count }, { status: 429 });

  const versionsInBundle = Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number);

  let versions: number[];
  if (versionsInput?.length) {
    const invalid = versionsInput.filter(v => !versionsInBundle.includes(v));
    if (invalid.length) return NextResponse.json({ error: `Versions not in bundle: ${invalid.join(',')}` }, { status: 400 });
    versions = versionsInput;
  } else {
    const { data: active } = await supabase
      .from('meerkat_active_versions')
      .select('active_version')
      .eq('meerkat_id', meerkatId)
      .maybeSingle();
    versions = [active?.active_version ?? 1];
  }

  const totalScenarios = computeTotalScenarios(meerkatId, versions);
  if (totalScenarios === 0) {
    return NextResponse.json({ error: `No calibrated scenarios for ${meerkatId}` }, { status: 400 });
  }

  const { data: run, error } = await supabase
    .from('golden_test_runs')
    .insert({
      meerkat_id: meerkatId,
      versions,
      trigger: 'manual',
      triggered_by: 'admin@centinelia.mx',
      status: 'queued',
      total_scenarios: totalScenarios,
      scenario_hash: hashScenarioSet(meerkatId),
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, run_id: run.id, meerkat_id: meerkatId, versions, reason });
}
```

- [ ] **Step 3: POST /api/admin/golden-tests/rerun**

Crear `src/app/api/admin/golden-tests/rerun/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { computeTotalScenarios } from '@/lib/golden-tests/orchestrator';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const meerkat = body.meerkat_id as string;
  const versions = body.versions as number[];

  if (!MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!Array.isArray(versions) || versions.length === 0) {
    return NextResponse.json({ error: 'versions must be non-empty array' }, { status: 400 });
  }

  const meerkatId = meerkat as MeerkatId;
  const versionsInBundle = Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number);
  const invalid = versions.filter(v => !versionsInBundle.includes(v));
  if (invalid.length) return NextResponse.json({ error: `Versions not in bundle: ${invalid.join(',')}` }, { status: 400 });

  const supabase = createAdminClient();

  // Borrar baselines de esas versiones (el nuevo run los recomputa)
  await supabase
    .from('golden_test_baselines')
    .delete()
    .eq('meerkat_id', meerkatId)
    .in('version', versions);

  const totalScenarios = computeTotalScenarios(meerkatId, versions);
  const { data: run, error } = await supabase
    .from('golden_test_runs')
    .insert({
      meerkat_id: meerkatId,
      versions,
      trigger: 'manual',
      triggered_by: 'admin@centinelia.mx',
      status: 'queued',
      total_scenarios: totalScenarios,
      scenario_hash: hashScenarioSet(meerkatId),
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, run_id: run.id, meerkat_id: meerkatId, versions, invalidated_baselines: versions });
}
```

- [ ] **Step 4: GET /api/admin/golden-tests/:runId**

Crear `src/app/api/admin/golden-tests/[runId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

interface Params { params: Promise<{ runId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { runId } = await params;
  const supabase = createAdminClient();

  const { data: run, error } = await supabase
    .from('golden_test_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();

  if (error || !run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const { data: recentRuns } = await supabase
    .from('golden_test_scenario_runs')
    .select('scenario_id, version, attempt, score, scenario_passed, duration_ms, cost_usd, error, created_at')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(20);

  const progress = run.total_scenarios > 0
    ? Math.round((run.completed_scenarios / run.total_scenarios) * 100) / 100
    : 0;

  return NextResponse.json({ run: { ...run, progress }, recent_scenario_runs: recentRuns ?? [] });
}
```

- [ ] **Step 5: GET /api/admin/versiones/:meerkat/gate-status?target=**

Crear `src/app/api/admin/versiones/[meerkat]/gate-status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_IDS, type MeerkatId, type GateStatus, type GateVerdict } from '@/lib/golden-tests/types';

const DELTA_WARN_THRESHOLD  = -0.02;
const DELTA_FAIL_THRESHOLD  = -0.05;
const ABSOLUTE_BOOTSTRAP_MIN = 0.70;

interface Params { params: Promise<{ meerkat: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const target = Number(new URL(req.url).searchParams.get('target'));

  if (!MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!Number.isInteger(target) || target < 1) {
    return NextResponse.json({ error: 'target must be integer >= 1' }, { status: 400 });
  }

  const meerkatId = meerkat as MeerkatId;
  const supabase = createAdminClient();

  const { data: activeRow } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkatId)
    .maybeSingle();
  const activeVersion = activeRow?.active_version ?? null;

  const versionsToFetch = Array.from(new Set([activeVersion, target].filter(v => v != null))) as number[];
  const { data: baselines } = await supabase
    .from('golden_test_baselines')
    .select('version, median_score, scenario_scores')
    .eq('meerkat_id', meerkatId)
    .in('version', versionsToFetch);

  const baselineByVersion = new Map(baselines?.map(b => [b.version, b]) ?? []);

  // Buscar run en curso para target
  const { data: runInProgress } = await supabase
    .from('golden_test_runs')
    .select('id, status, total_scenarios, completed_scenarios, versions')
    .eq('meerkat_id', meerkatId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const targetBaseline = baselineByVersion.get(target);
  const activeBaseline = activeVersion != null ? baselineByVersion.get(activeVersion) : null;

  const targetInRun = runInProgress?.versions.includes(target);
  const runStatus: GateStatus['target']['run_status'] = targetBaseline
    ? 'completed'
    : (targetInRun ? (runInProgress.status as 'queued' | 'running') : 'none');

  const targetProgress = targetInRun && runInProgress.total_scenarios > 0
    ? runInProgress.completed_scenarios / runInProgress.total_scenarios
    : (targetBaseline ? 1 : 0);

  const targetScored = targetBaseline
    ? Object.keys(targetBaseline.scenario_scores ?? {}).length
    : (targetInRun ? Math.round((runInProgress.completed_scenarios ?? 0) / 3) : 0); // /3 = N_ATTEMPTS

  // Verdict
  let verdict: GateVerdict = 'incomplete';
  let delta: number | null = null;

  if (targetBaseline && activeVersion === target) {
    verdict = 'pass'; // no-op reactivación
  } else if (targetBaseline && activeBaseline) {
    delta = Number(targetBaseline.median_score) - Number(activeBaseline.median_score);
    if (delta >= DELTA_WARN_THRESHOLD) verdict = 'pass';
    else if (delta >= DELTA_FAIL_THRESHOLD) verdict = 'warn';
    else verdict = 'fail';
  } else if (targetBaseline && !activeBaseline) {
    // Bootstrap: primera versión sin activa previa evaluada
    verdict = Number(targetBaseline.median_score) >= ABSOLUTE_BOOTSTRAP_MIN ? 'pass' : 'fail';
  }

  const response: GateStatus = {
    meerkat_id: meerkatId,
    active: activeBaseline ? {
      version: activeVersion!,
      median: Number(activeBaseline.median_score),
      scenarios_scored: Object.keys(activeBaseline.scenario_scores ?? {}).length,
    } : null,
    target: {
      version: target,
      median: targetBaseline ? Number(targetBaseline.median_score) : null,
      scenarios_scored: targetScored,
      run_status: runStatus,
      progress: targetProgress,
    },
    delta,
    verdict,
  };

  return NextResponse.json(response);
}
```

- [ ] **Step 6: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Smoke test manual**

```bash
# Trigger sin escenarios calibrados → 400
curl -X POST -H "Cookie: Centinelia_admin=$ADMIN_SECRET" -H "Content-Type: application/json" \
  http://localhost:3000/api/admin/golden-tests/trigger -d '{"meerkat_id":"nia"}'

# Gate status sin baseline → verdict=incomplete
curl -H "Cookie: Centinelia_admin=$ADMIN_SECRET" \
  "http://localhost:3000/api/admin/versiones/nia/gate-status?target=1"
```

Esperado: primer curl retorna 400 con "No calibrated scenarios". Segundo curl retorna `verdict: "incomplete"`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/golden-tests/ src/app/api/admin/versiones/\[meerkat\]/gate-status/ src/lib/admin/auth.ts
git commit -m "feat(api): golden-tests trigger/rerun/status + gate-status for modal"
```

---

## Task 11: Extender ActivateVersionModal con GateVerdictPanel + override_reason

**Files:**
- Create: `src/components/admin/GateVerdictPanel.tsx`
- Modify: `src/components/admin/ActivateVersionModal.tsx`
- Modify: `src/app/api/admin/versiones/[meerkat]/activate/route.ts`

**Interfaces:**
- Consumes: `GET /api/admin/versiones/:meerkat/gate-status`, `GateStatus` type (Task 2)
- Produces:
  - `<GateVerdictPanel>` — client component que fetchea gate-status y muestra active/target/delta/verdict
  - Modal actualizado: campo `override_reason` visible si verdict=='fail', botón cambia color por verdict, `override_reason` se envía al POST activate
  - POST activate valida y persiste `override_reason` en `meerkat_version_history.notes`

- [ ] **Step 1: Crear GateVerdictPanel**

Crear `src/components/admin/GateVerdictPanel.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import type { GateStatus, GateVerdict } from '@/lib/golden-tests/types';

interface Props {
  meerkat_id: string;
  target_version: number;
}

export function GateVerdictPanel({ meerkat_id, target_version }: Props) {
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/versiones/${meerkat_id}/gate-status?target=${target_version}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        setStatus(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [meerkat_id, target_version]);

  if (loading) return <div className="text-xs text-slate-500 py-3"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando golden tests…</div>;
  if (error) return <div className="text-xs text-red-600 py-3">Error: {error}</div>;
  if (!status) return null;

  const { verdict, active, target, delta } = status;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <VerdictBadge verdict={verdict} />
        {delta != null && (
          <span className="text-xs font-mono text-slate-700">
            Δ {delta > 0 ? '+' : ''}{delta.toFixed(2)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-slate-500">Activa (v{active?.version ?? '?'})</div>
          <div className="text-slate-900 font-mono">
            {active ? active.median.toFixed(2) : '—'}
            {active && <span className="text-slate-400"> ({active.scenarios_scored} esc.)</span>}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Objetivo (v{target.version})</div>
          <div className="text-slate-900 font-mono">
            {target.median != null ? target.median.toFixed(2) : '—'}
            <span className="text-slate-400"> ({target.scenarios_scored} esc.)</span>
          </div>
        </div>
      </div>

      {target.run_status === 'running' || target.run_status === 'queued' ? (
        <div className="text-xs text-slate-600 pt-1 border-t border-slate-200">
          Tests en curso: {Math.round(target.progress * 100)}%
        </div>
      ) : null}

      {verdict === 'incomplete' && target.run_status === 'none' && (
        <div className="text-xs text-amber-700 pt-1 border-t border-slate-200">
          No hay baseline para esta versión. Correr golden tests primero para tener veredicto.
        </div>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: GateVerdict }) {
  const cfg: Record<GateVerdict, { icon: React.ReactNode; label: string; cls: string }> = {
    pass:       { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Pasa', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    warn:       { icon: <AlertTriangle className="w-4 h-4" />, label: 'Degradación leve', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    fail:       { icon: <XCircle className="w-4 h-4" />, label: 'Falla', cls: 'text-red-700 bg-red-50 border-red-200' },
    incomplete: { icon: <Loader2 className="w-4 h-4" />, label: 'Sin veredicto', cls: 'text-slate-700 bg-white border-slate-200' },
  };
  const c = cfg[verdict];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  );
}
```

- [ ] **Step 2: Extender ActivateVersionModal**

Modificar `src/components/admin/ActivateVersionModal.tsx`. Cambios:

a) Import `<GateVerdictPanel>` y `useEffect` para fetch verdict cuando cambia `selectedVersion`.
b) Estado nuevo: `verdict: GateVerdict | null`, `overrideReason: string`.
c) Renderizar `<GateVerdictPanel>` debajo del select de versión.
d) Campo `overrideReason` (textarea) visible solo si `verdict === 'fail'`.
e) POST include `override_reason` si presente.
f) Botón: color y label según verdict.

Reemplazar el archivo completo:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { GateVerdictPanel } from './GateVerdictPanel';
import type { GateVerdict } from '@/lib/golden-tests/types';

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
  const [overrideReason, setOverrideReason] = useState('');
  const [verdict, setVerdict] = useState<GateVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/versiones/${row.meerkat_id}/gate-status?target=${selectedVersion}`);
        const data = await res.json();
        if (!cancelled && res.ok) setVerdict(data.verdict);
      } catch { /* silent */ }
    }
    load();
    return () => { cancelled = true; };
  }, [row.meerkat_id, selectedVersion]);

  const needsOverride = verdict === 'fail' || verdict === 'incomplete';
  const canSubmit = !needsOverride || overrideReason.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/versiones/${row.meerkat_id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: selectedVersion,
          reason: reason || undefined,
          override_reason: needsOverride ? overrideReason.trim() : undefined,
          gate_verdict: verdict,
        }),
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

  const btnCls =
    verdict === 'fail' ? 'bg-red-600 hover:bg-red-700' :
    verdict === 'warn' ? 'bg-amber-600 hover:bg-amber-700' :
    'bg-slate-900 hover:bg-slate-800';

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

          <GateVerdictPanel meerkat_id={row.meerkat_id} target_version={selectedVersion} />

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

          {needsOverride && (
            <div>
              <label className="text-xs font-medium text-red-700 mb-1 block">
                Motivo del override (obligatorio):
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="ej. rollback urgente por incidente. Sé que degrada."
                rows={3}
                className="w-full border border-red-300 rounded px-2 py-1.5 text-sm"
              />
            </div>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded">Cancelar</button>
          <button onClick={submit} disabled={submitting || !canSubmit} className={`px-3 py-1.5 text-sm text-white rounded disabled:opacity-50 ${btnCls}`}>
            {submitting ? 'Activando…' : `Activar v${selectedVersion}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Modificar POST activate para aceptar override_reason**

Editar `src/app/api/admin/versiones/[meerkat]/activate/route.ts`. En la sección que arma el body y actualiza history, aceptar dos campos nuevos: `override_reason` y `gate_verdict`.

Buscar la línea `const { version, reason } = body as { version?: number; reason?: string };` y reemplazarla:

```typescript
const {
  version,
  reason,
  override_reason,
  gate_verdict,
} = body as {
  version?: number;
  reason?: string;
  override_reason?: string;
  gate_verdict?: 'pass' | 'warn' | 'fail' | 'incomplete';
};

if ((gate_verdict === 'fail' || gate_verdict === 'incomplete') && !override_reason?.trim()) {
  return NextResponse.json({
    error: `override_reason is required when gate_verdict is '${gate_verdict}'`,
  }, { status: 400 });
}
```

Luego, en el INSERT a `meerkat_version_history`, agregar los campos a `reason`:

```typescript
const historyReason = override_reason
  ? `[OVERRIDE:${gate_verdict}] ${override_reason}${reason ? ` — ${reason}` : ''}`
  : (reason ?? finalReason);

const { error: histErr } = await supabase.from('meerkat_version_history').insert({
  meerkat_id: meerkat,
  from_version: currentVersion,
  to_version: version,
  changed_by: auth.email,
  reason: historyReason,
});
```

- [ ] **Step 4: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Smoke test manual (staging)**

```bash
# Sin override en fail → 400
curl -X POST -H "Cookie: Centinelia_admin=$ADMIN_SECRET" -H "Content-Type: application/json" \
  http://localhost:3000/api/admin/versiones/nia/activate \
  -d '{"version": 1, "gate_verdict": "fail"}'

# Con override → 200
curl -X POST -H "Cookie: Centinelia_admin=$ADMIN_SECRET" -H "Content-Type: application/json" \
  http://localhost:3000/api/admin/versiones/nia/activate \
  -d '{"version": 1, "gate_verdict": "fail", "override_reason": "test"}'
```

Esperado: primero 400 "override_reason is required", segundo 200 con activate exitoso.

Manualmente: abrir `/admin/versiones`, click Cambiar en nia. Modal debe mostrar `<GateVerdictPanel>` con "Sin veredicto" (verdict=incomplete). Textarea de override_reason debe aparecer. Botón cambia color a rojo. Sin override, botón deshabilitado.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/GateVerdictPanel.tsx src/components/admin/ActivateVersionModal.tsx \
        src/app/api/admin/versiones/\[meerkat\]/activate/route.ts
git commit -m "feat(admin): gate verdict panel + override_reason in activate flow"
```

---

## Task 12: Health page + AdminNav + calibración one-off

**Files:**
- Create: `src/app/admin/versiones/health/page.tsx`
- Create: `src/components/admin/GoldenTestsHealthTable.tsx`
- Create: `scripts/calibrate-golden-scenarios.ts`
- Modify: `src/components/admin/AdminNav.tsx` (o donde viva el nav admin)
- Modify: `src/lib/golden-tests/scenarios/nia.ts` (agregar calibrated_at + calibrated_score a los 4 escenarios)
- Modify: `__snapshots__/golden-scenarios.json` (nuevo hash de nia — nota: hash canonicalize excluye calibrated_at, así que NO debería cambiar; verificar)

**Interfaces:**
- Consumes: `runScenario` (Task 6), `NIA_SCENARIOS` (Task 3), Supabase
- Produces:
  - Página `/admin/versiones/health` con últimos 20 runs + costo mes + tasa fallo 24h
  - Nav entry "Golden tests" en admin
  - Script `calibrate-golden-scenarios.ts`: corre N=5 cada escenario contra v activa, imprime `calibrated_score` sugerido, deja al humano decidir si aceptar

- [ ] **Step 1: Script de calibración**

Crear `scripts/calibrate-golden-scenarios.ts`:

```typescript
import { NIA_SCENARIOS } from '@/lib/golden-tests/scenarios/nia';
import { runScenario } from '@/lib/golden-tests/runner';
import type { GoldenScenario } from '@/lib/golden-tests/types';

const N_CALIBRATION = 5;
const TARGET_MIN = 0.75;
const TARGET_MAX = 0.95;

async function calibrate(scenario: GoldenScenario, version: number) {
  console.log(`\n=== ${scenario.id} vs v${version} — running N=${N_CALIBRATION} ===`);
  const scores: number[] = [];

  for (let i = 1; i <= N_CALIBRATION; i++) {
    const result = await runScenario(scenario, version);
    const s = result.score;
    console.log(`  attempt ${i}: score=${s}, cost=$${result.cost_usd}, dur=${result.duration_ms}ms, err=${result.error}`);
    if (s != null) scores.push(s);
  }

  if (scores.length === 0) {
    console.error(`  ⚠ NO SCORES — cannot calibrate. Fix runner/judge before proceeding.`);
    return;
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  console.log(`  → median=${median.toFixed(2)}, range=[${min.toFixed(2)}, ${max.toFixed(2)}]`);

  if (median < TARGET_MIN) {
    console.log(`  ⚠ median below ${TARGET_MIN} — rubric too strict, consider softening.`);
  } else if (max >= 1.00 && min >= 0.98) {
    console.log(`  ⚠ scoring at ceiling — rubric doesn't discriminate, add negative criteria.`);
  } else if (median > TARGET_MAX) {
    console.log(`  ⚠ median above ${TARGET_MAX} — consider stricter rubric.`);
  } else {
    console.log(`  ✓ within [${TARGET_MIN}, ${TARGET_MAX}] — good to calibrate.`);
  }

  console.log(`\n  To calibrate, add to the scenario:`);
  console.log(`    calibrated_at: '${new Date().toISOString()}',`);
  console.log(`    calibrated_score: ${median.toFixed(2)},`);
}

async function main() {
  for (const scenario of NIA_SCENARIOS) {
    await calibrate(scenario, 1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr calibración (esperar ~15-25 min, cuesta ~$1.50)**

```bash
npx tsx scripts/calibrate-golden-scenarios.ts
```

Anotar el `calibrated_score` sugerido para cada escenario. Si algún escenario tiene median fuera de `[0.75, 0.95]`, ajustar el rubric del escenario y re-correr solo ese.

- [ ] **Step 3: Escribir calibración en los escenarios**

Editar `src/lib/golden-tests/scenarios/nia.ts` agregando `calibrated_at` y `calibrated_score` a cada uno de los 4 escenarios. Ejemplo para el primero:

```typescript
{
  id: 'nia.agendar-cita-basico',
  // ... resto igual ...
  calibrated_at: '2026-07-31T12:00:00.000Z',  // usar la fecha real de la corrida
  calibrated_score: 0.87,                       // usar el valor real del script
},
```

- [ ] **Step 4: Re-verificar snapshot (NO debe cambiar — hash excluye calibrated_at)**

```bash
npx tsx scripts/verify-golden-scenarios-snapshot.ts
```

Esperado: `[ok] nia (count=4)` — el hash NO cambia porque `canonicalize()` excluye campos de calibración. Si cambia, hay bug en `hash.ts` — revisar.

- [ ] **Step 5: Health page**

Crear `src/app/admin/versiones/health/page.tsx`:

```typescript
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { GoldenTestsHealthTable } from '@/components/admin/GoldenTestsHealthTable';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function HealthPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const supabase = createAdminClient();

  const { data: recentRuns } = await supabase
    .from('golden_test_runs')
    .select('id, meerkat_id, versions, trigger, status, total_scenarios, completed_scenarios, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent24h } = await supabase
    .from('golden_test_scenario_runs')
    .select('score, error, cost_usd')
    .gte('created_at', since24h);

  const total24h = recent24h?.length ?? 0;
  const failed24h = recent24h?.filter(r => r.error != null).length ?? 0;
  const cost24h = recent24h?.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0) ?? 0;
  const failRate = total24h > 0 ? (failed24h / total24h) : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Golden tests — health</h1>
        <p className="text-sm text-slate-600 mt-1">Últimos runs, costo, y tasa de fallo técnico.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card label="Scenario runs 24h" value={String(total24h)} />
        <Card label="Fallos técnicos 24h" value={`${failed24h} (${(failRate * 100).toFixed(1)}%)`} warn={failRate > 0.10} />
        <Card label="Costo 24h" value={`$${cost24h.toFixed(2)}`} />
      </div>

      <GoldenTestsHealthTable runs={recentRuns ?? []} />
    </div>
  );
}

function Card({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${warn ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
```

- [ ] **Step 6: GoldenTestsHealthTable**

Crear `src/components/admin/GoldenTestsHealthTable.tsx`:

```typescript
'use client';

interface Run {
  id: string;
  meerkat_id: string;
  versions: number[];
  trigger: string;
  status: string;
  total_scenarios: number;
  completed_scenarios: number;
  created_at: string;
  completed_at: string | null;
}

export function GoldenTestsHealthTable({ runs }: { runs: Run[] }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-3">Meerkat</th>
            <th className="text-left px-4 py-3">Versiones</th>
            <th className="text-left px-4 py-3">Trigger</th>
            <th className="text-left px-4 py-3">Estado</th>
            <th className="text-left px-4 py-3">Progreso</th>
            <th className="text-left px-4 py-3">Creado</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{r.meerkat_id}</td>
              <td className="px-4 py-3 font-mono text-xs">v[{r.versions.join(',')}]</td>
              <td className="px-4 py-3 text-xs">{r.trigger}</td>
              <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              <td className="px-4 py-3 text-xs">
                {r.completed_scenarios}/{r.total_scenarios}
                {r.total_scenarios > 0 && ` (${Math.round((r.completed_scenarios / r.total_scenarios) * 100)}%)`}
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">{new Date(r.created_at).toLocaleString('es-MX')}</td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">Sin runs aún.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    status === 'running'   ? 'bg-blue-50 text-blue-700 border-blue-200' :
    status === 'failed'    ? 'bg-red-50 text-red-700 border-red-200' :
                             'bg-slate-50 text-slate-700 border-slate-200';
  return <span className={`inline-block px-2 py-0.5 rounded border text-xs ${cls}`}>{status}</span>;
}
```

- [ ] **Step 7: AdminNav entry**

Buscar el archivo del sidebar admin:

```bash
grep -rn "Versiones\|GitBranch" /c/Users/Nazre/centinelia/src/components/admin --include="*.tsx"
```

Localizar donde se lista "Versiones" (creado en session 47). Agregar debajo una entry:

```typescript
{ label: 'Golden tests', href: '/admin/versiones/health', icon: FlaskConical },
```

Importar `FlaskConical` de `lucide-react`.

- [ ] **Step 8: Trigger primer baseline manual**

Ahora que hay escenarios calibrados, disparar el primer baseline:

```bash
curl -X POST -H "Cookie: Centinelia_admin=$ADMIN_SECRET" -H "Content-Type: application/json" \
  http://localhost:3000/api/admin/golden-tests/trigger -d '{"meerkat_id":"nia","reason":"baseline v1 inicial"}'
```

Esperado: `{ ok: true, run_id: "..." }`. El worker cron (o correr manualmente `/api/cron/golden-tests-worker` varias veces) procesará los 12 scenario_runs (4 escenarios × 1 versión × 3 attempts). Tomará ~10-15 min.

Verificar en `/admin/versiones/health`: el run debe aparecer, avanzando de queued → running → completed. Al completar, `golden_test_baselines` tiene fila para (nia, 1).

- [ ] **Step 9: Verify E2E — abrir modal y ver verdict poblado**

Abrir `/admin/versiones` → click Cambiar en nia. Con solo v1, el modal no tiene "otras versiones" para elegir (los `otherVersions.filter(v => v !== active)` da vacío). Para verificar el flujo:

a) Manualmente agregar `NIA_CONFIGS[2]` en `meerkat-configs.ts` (copia de v1 con temp cambiada) → deploy local.
b) Correr detect: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/golden-tests-detect` → debe insertar run.
c) Correr worker varias veces hasta completar.
d) Abrir modal → seleccionar v2 → `<GateVerdictPanel>` debe mostrar delta y verdict.

Esto es opcional pero confirma que la cadena entera funciona.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/versiones/health/page.tsx src/components/admin/GoldenTestsHealthTable.tsx \
        src/components/admin/AdminNav.tsx scripts/calibrate-golden-scenarios.ts \
        src/lib/golden-tests/scenarios/nia.ts
git commit -m "feat(admin): golden tests health page + AdminNav + calibrate nia scenarios"
```

---

## Self-review (post-plan)

**Spec coverage:**
- Multi-turn simulado (usuario+meerkat+juez): Tasks 4, 5, 6 ✓
- Cobertura por meerkat (4-5 c/u): Task 3 (solo nia MVP), rest = follow-up ✓
- Regresión vs versión activa, delta cap: Task 10 (gate-status endpoint) ✓
- Advisory con override obligatorio: Task 11 ✓
- Async + baseline pre-corrido: Tasks 8 + 9 ✓
- TypeScript en repo: Tasks 2, 3 ✓
- Runner con SELECT FOR UPDATE SKIP LOCKED: Task 1 (SQL fn) + Task 7 (acquireNextRun) ✓
- N=3 attempts, mediana: Task 7 ✓
- 3 tablas nuevas: Task 1 ✓
- Bootstrap threshold 0.70: Task 10 ✓
- Hash-based invalidation: Tasks 2 + 8 ✓
- Cap 500/day: Tasks 7 + 8 + 9 ✓
- Calibración N=5: Task 12 ✓
- Health page + admin UI: Tasks 11 + 12 ✓
- Testing del runner: Smoke scripts in Tasks 4, 5, 6, 12 — NO hay Vitest en repo, patrón `npx tsx` es lo que existe ✓

**Placeholder scan:** limpiado — todos los pasos tienen código concreto. Único "TBD-shape" es el system prompt de nia en Task 3 que puede ajustarse tras primera calibración (documentado en el paso).

**Type consistency:**
- `GoldenScenario`, `ScenarioRun`, `JudgeOutput`, `GateStatus`, `GateVerdict`, `MeerkatId`, `ConversationTurn` — definidos en Task 2, referenciados en Tasks 3-12. Consistentes ✓
- `runScenario(scenario, version)` — signatura en Task 6, consumida en Task 9 y 12 ✓
- `judgeTranscript` returns `{ output: JudgeOutput | null; tokens: number }` — Task 5 firma, Task 6 la usa ✓
- `hashScenarioSet(meerkatId)` — Task 2, usado en Tasks 8, 10, 12 ✓
- `acquireNextRun`, `findNextPendingScenario`, `computeAndUpsertBaselines` — Task 7, usados en Task 9 ✓
- `scenario_passed` (nueva column, no `passed`) — Task 1 SQL, Task 6 runner, Task 10 API ✓
- `override_reason`, `gate_verdict` fields — Task 11 modal → Task 11 activate route ✓

**Notas para el implementador:**
- Task 3 asume que puedes crear un system prompt canónico simplificado. Si el prompt-builder actual es demasiado complejo para extraer, TALK to Nazre antes de spend time reimplementando lo mismo.
- Task 12 calibración cuesta ~$1.50 y toma 15-25 min. Correr con `.env.local` cargado.
- Task 9 worker asume single-tenant per run (SKIP LOCKED evita duplicados). NO paralelizar sin repensar `bumpCompletedScenarios`.
- El scope explícito de este plan es solo `nia` con 4 escenarios. Los 9 meerkats restantes siguen la misma plantilla — nuevo plan follow-up puede replicar el patrón de Task 3 + Task 12 en batch.

---

## Execution notes

- **Total: 12 tasks.**
- **Estimated cost E2E (dev + calibración): ~$5** (12 scenario_runs debug + N=5 calibración × 4 escenarios = 32 runs @ ~$0.03 = $0.96 calibration; smokes de Tasks 4/5/6 son ~$0.10; primer baseline real ~$0.30. Total ≤ $5.)
- **Estimated time E2E (implementer, assuming subagent-driven):** ~4-6 horas de tasks + ~20 min waiting for calibration + first baseline.
- **Rollback:** cada task es un commit atómico. Revert de commit revierte code + snapshot.
