# Golden Tests Suite — Pilar 4 Evolution Framework

**Fecha:** 2026-07-30
**Estado:** Diseño listo para plan
**Contexto:** [[decisions_centinelia_session47]] (pilar 1 versioning LIVE), [[project_centinelia_evolution_framework]] (roadmap)

## Objetivo

Detectar regresión de comportamiento cuando se activa una nueva versión de un meerkat, antes de que degrade llamadas reales de clientes. Componente de gate del modal `ActivateVersionModal` en `/admin/versiones`.

**No-objetivo:** este spec NO cubre observabilidad post-activación (pilar 5), ni feature-flag rollout gradual per-cohorte (pilar 3). Solo el gate pre-activación.

## Decisiones fundacionales

| # | Decisión | Elegido |
|---|----------|---------|
| 1 | Shape del test | Multi-turn simulado (usuario LLM + meerkat real + juez LLM) |
| 2 | Cobertura | ~45 escenarios, 4-5 por meerkat (los 10) |
| 3 | Baseline | Regresión vs versión activa, delta cap |
| 4 | Gate mode | Advisory con override obligatorio en fail |
| 5 | Ejecución | Async, baseline pre-corrido cuando aparece nueva versión |
| 6 | Storage | TypeScript en repo, paralelo a `MEERKAT_CONFIGS` |
| 7 | Runner | Coordinator + cron cada 1 min, `SELECT FOR UPDATE SKIP LOCKED` |
| 8 | Variance | N=3 attempts por escenario, score = mediana |

## Arquitectura

Tres unidades con interfaces claras y responsabilidades disjuntas:

### 1. Scenario library — `src/lib/golden-tests/`

```
scenarios/
  nia.ts       # 4-5 escenarios de recepción 24/7
  nox.ts       # 4-5 de delegación de tareas
  noah.ts      # ventas
  nico.ts, nelia.ts, nara.ts, naia.ts, neo.ts, nova.ts, niva.ts
types.ts       # GoldenScenario interface
registry.ts    # GOLDEN_SCENARIOS: Record<meerkat_id, GoldenScenario[]>
hash.ts        # hashScenarioSet(meerkat) → sha256 estable, para invalidación de baselines
```

**Interfaz `GoldenScenario`:**
```typescript
interface GoldenScenario {
  id: string;                     // 'nia.agendar-cita-tarde-insistente'
  meerkat_id: MeerkatId;          // 'nia'
  title: string;                  // legible en admin UI
  user_persona: {
    goal: string;                 // "conseguir cita para vacunar perro entre 4 y 6pm"
    script_hints: string;         // guía de tono/dificultad para el usuario simulado
    initial_message: string;      // primer turno del usuario (fijo para reducir variance)
  };
  success_criteria: string[];     // ['agendó cita en horario tarde', 'pidió RFC', 'confirmó dirección']
  max_turns: number;              // 3-15
  judge_rubric: string;           // instrucciones estructuradas para Sonnet
  calibrated_at?: string;         // ISO date - solo escenarios calibrados cuentan para gate
  calibrated_score?: number;      // score de referencia en calibración inicial
}
```

**Regla dura:** un escenario sin `calibrated_at` NO participa del gate (aparece en admin como "pendiente de calibración").

### 2. Runner — `src/lib/golden-tests/runner/`

```
runner.ts              # runScenario(scenario, version) → ScenarioRun
simulated-user.ts      # Haiku 4.5, temp 0.7, juega el guión
judge.ts               # Sonnet 4.6, temp 0.1, JSON structured output
meerkat-invoker.ts     # invoca al meerkat REAL vía resolveMeerkatConfig(id, version)
```

Puro y sin estado — recibe scenario + version, retorna resultado. Testeable en aislamiento con mocks.

**Contrato del runner:**
```typescript
interface ScenarioRun {
  scenario_id: string;
  version: number;
  score: number | null;              // null si error técnico
  scenario_passed: boolean;          // score >= 0.70 (nivel escenario individual, informativo)
  transcript: ConversationTurn[];
  judge_output: JudgeOutput;
  duration_ms: number;
  error: 'meerkat_provider_fail' | 'judge_parse_fail' | 'user_loop' | 'max_turns_reached' | null;
  tokens_used: { user: number; meerkat: number; judge: number };
  cost_usd: number;
}
```

**Terminología:**
- **`scenario_passed`** = un escenario individual cumplió su rubric (score ≥ 0.70). Informativo, se muestra en admin UI para debug.
- **`gate_verdict`** = decisión del gate al comparar dos versiones (pass/warn/fail/incomplete). Usa delta de mediana de medianas, NO scenario_passed. Es lo único que bloquea/permite activación.
```

### 3. Orchestrator — coordinación async

```
src/app/api/cron/golden-tests-detect/route.ts     # cada 5 min, detecta versiones sin baseline
src/app/api/cron/golden-tests-worker/route.ts     # cada 1 min, procesa 1 scenario_run
src/app/api/admin/golden-tests/trigger/route.ts   # POST manual (forzar re-run)
src/app/api/admin/golden-tests/rerun/route.ts     # POST manual (invalidar baseline + re-correr)
src/app/api/admin/golden-tests/[runId]/route.ts   # GET status del run
src/lib/golden-tests/orchestrator.ts              # findNextPendingScenario, upsertBaseline
```

**Detector (cron 5 min):**
```
FOR meerkat IN keys(MEERKAT_CONFIGS):
  bundle_versions = keys(MEERKAT_CONFIGS[meerkat])
  scenario_hash = hashScenarioSet(meerkat)
  baselines = SELECT version, scenario_hash FROM golden_test_baselines WHERE meerkat_id = meerkat
  missing_versions = bundle_versions \ baselines.version
  stale_baselines = baselines WHERE scenario_hash != current_scenario_hash

  IF missing_versions ∪ stale_baselines != ∅:
    active_version = SELECT active_version FROM meerkat_active_versions WHERE meerkat_id = meerkat
    versions_to_run = missing_versions ∪ {active_version if stale} ∪ stale_baselines.version
    INSERT INTO golden_test_runs (meerkat, versions, trigger='auto', status='queued', ...)
    IF stale: DELETE FROM golden_test_baselines WHERE meerkat_id = meerkat
```

**Worker (cron 1 min):**
```
BEGIN;
run = SELECT * FROM golden_test_runs
      WHERE status IN ('queued','running')
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

IF run.status = 'queued':
  UPDATE run SET status='running', started_at=NOW();

next = SELECT scenario_id, version, attempt
       FROM find_next_pending_scenario(run.id)   -- SQL fn: (scenario × version × attempt) sin scenario_run existente
       LIMIT 1;

IF next IS NULL:
  -- Todos los scenarios × versiones × 3 attempts completos
  compute_baselines(run);   -- UPSERT golden_test_baselines por (meerkat, version) con mediana
  UPDATE run SET status='completed', completed_at=NOW();
  COMMIT;
  RETURN;

COMMIT;

-- Fuera de la transacción (larga: 30-60s):
result = runScenario(scenario, next.version);
INSERT INTO golden_test_scenario_runs (run_id, ...result);
UPDATE run SET completed_scenarios = completed_scenarios + 1;
```

**Idempotencia:** el worker sólo escribe `scenario_run` nuevos; si el cron se dispara dos veces con el mismo `run`, `FOR UPDATE SKIP LOCKED` garantiza que sólo uno procesa a la vez.

## Data model

Tres tablas nuevas. Migration `migrations/20260731_golden_tests.sql`.

**`golden_test_runs`**
```sql
CREATE TABLE golden_test_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meerkat_id          text NOT NULL,
  versions            int[] NOT NULL,                     -- [1,2] cuando compara
  trigger             text NOT NULL,                       -- 'auto-new-version'|'auto-scenario-changed'|'manual'
  triggered_by        text NOT NULL,                       -- admin email o 'system'
  status              text NOT NULL DEFAULT 'queued',      -- queued|running|completed|failed
  total_scenarios     int NOT NULL,                        -- scenarios × versiones × 3 attempts
  completed_scenarios int NOT NULL DEFAULT 0,
  scenario_hash       text NOT NULL,                       -- snapshot del hash al momento del run
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  started_at          timestamptz,
  completed_at        timestamptz
);
CREATE INDEX ON golden_test_runs (meerkat_id, status);
CREATE INDEX ON golden_test_runs (status) WHERE status IN ('queued','running');
```

**`golden_test_scenario_runs`**
```sql
CREATE TABLE golden_test_scenario_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES golden_test_runs(id) ON DELETE CASCADE,
  scenario_id  text NOT NULL,
  meerkat_id   text NOT NULL,
  version      int NOT NULL,
  attempt      int NOT NULL,                              -- 1, 2, 3
  score           numeric(3,2),                           -- NULL si error
  scenario_passed boolean,                                 -- score >= 0.70; informativo, no afecta gate
  transcript      jsonb NOT NULL,
  judge_output jsonb,
  duration_ms  int NOT NULL,
  cost_usd     numeric(6,4),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, scenario_id, version, attempt)
);
CREATE INDEX ON golden_test_scenario_runs (meerkat_id, version);
```

**`golden_test_baselines`**
```sql
CREATE TABLE golden_test_baselines (
  meerkat_id       text NOT NULL,
  version          int NOT NULL,
  run_id           uuid NOT NULL REFERENCES golden_test_runs(id),
  median_score     numeric(3,2) NOT NULL,                -- media de medianas por escenario
  scenario_scores  jsonb NOT NULL,                        -- {scenario_id: median_score}
  scenario_hash    text NOT NULL,                         -- hash del scenario set al momento
  computed_at      timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meerkat_id, version)
);
```

## Data flow — 4 flujos

### Flujo A: Deploy detecta nueva versión (auto)
```
Dev agrega NIA_CONFIGS[2] → push → deploy
  ↓
cron detect (5min): ve v2 missing → INSERT run (queued)
  ↓
cron worker (1min × ~135 veces × ~30-45s): procesa scenario_runs
  ↓
worker termina último scenario: compute_baselines() → UPSERT golden_test_baselines
```
Duración total ≈ 2-3 horas end-to-end. Es un batch nocturno, no bloquea nada.

### Flujo B: Abrir modal ActivateVersionModal
```
GET /api/admin/versiones/nia/gate-status?target=2
  ↓
{
  active: { version: 1, median: 0.89, scenarios_scored: 45 },
  target: { version: 2, median: 0.86, scenarios_scored: 30, run_status: 'running', progress: 0.66 },
  delta: -0.03,
  verdict: 'warn'
}
  ↓
Modal renderiza según verdict:
- pass       (delta ≥ -0.02):    botón verde, reason opcional
- warn       (-0.05 ≤ Δ < -0.02): botón amarillo, reason opcional
- fail       (Δ < -0.05):         botón rojo, override_reason obligatorio + confirm doble
- incomplete (target sin baseline): progress bar + botón deshabilitado + link "activar sin tests"
```

### Flujo C: Activar
```
POST /api/admin/versiones/nia/activate { version: 2, reason?, override_reason? }
  ↓
IF verdict == 'fail' AND !override_reason: 400
  ↓
INSERT meerkat_version_history con { gate_verdict, gate_delta, override_reason, gate_run_id }
  ↓
resto del flujo actual: UPDATE active_version → clearCache → resync
```

### Flujo D: Re-run manual
```
POST /api/admin/golden-tests/rerun { meerkat, versions[] }
  ↓
Nuevo golden_test_runs con trigger='manual'
Baselines viejos se conservan hasta que el nuevo termine (no hueco en gate)
```

## Bootstrap y regla especial

**Primera versión de un meerkat (no hay versión activa previa)** — no puede haber "regresión vs activa" cuando activa es la misma. Regla única:
- Verdict = `pass` si `median_score ≥ 0.70` absoluto
- Verdict = `fail` si `median_score < 0.70` con override disponible

Este es el único caso donde aplica threshold absoluto en lugar de delta.

**Meerkat sin agentes activos hoy:** el gate corre igual. "0 agentes afectados" en el modal no suprime tests — un día habrá agentes.

## Error handling

| Escenario | Manejo |
|-----------|--------|
| Meerkat 429/timeout | Retry × 3 con backoff exponencial → si sigue: `error='meerkat_provider_fail'`, score=null |
| Juez JSON malformado | Re-invocar con structured output × 2 → si sigue: `error='judge_parse_fail'`, score=null |
| Usuario simulado loop (mismo turn ×3) | Hard-cut, score=0, `error='user_loop'` (señal legítima) |
| Cron timeout Vercel 300s | Cada iteración = 1 scenario_run ≤ 60s. Estado persistente en DB, próximo cron continúa |
| Race: dos crons toman el mismo run | `SELECT FOR UPDATE SKIP LOCKED` en Postgres nativo |
| Activate durante baseline en curso | Permitido. History log queda con `gate_verdict='incomplete'` |
| Rollback urgente a v1 con tests failing | Override_reason obligatorio. No bloqueado. Trazabilidad en history |
| Escenario editado en PR | Hash cambia → invalida baselines de ese meerkat (no otros). Runbook: cuesta ~2-3h re-baseline |
| >30% scenario_runs con error técnico | Run marca `failed`. Gate cae en `incomplete` — no engaña con score sesgado |

**Cap de costo runaway:** `MAX_DAILY_SCENARIO_RUNS = 500`. Detector cuenta scenario_runs de últimas 24h; si supera cap, pausa nuevos runs y envía email a admin. Estimación normal: ~270 runs por baseline nuevo × ~$0.03 = **~$8**. Sin nuevas versiones: $0.

## Testing del runner mismo

Sin esto, bugs del runner → señal falsa → pierde el punto entero.

**Unit tests (Vitest, DB-free)**
- `simulated-user.spec.ts`: respeta max_turns, corta cuando goal cumplido, sale limpio si meerkat cuelga
- `judge.spec.ts`: parsea JSON válido, retorna null tras 2 fails de parseo, aplica rubric del escenario correcto
- `runner.spec.ts`: shape del resultado, mediana correcta con N=3, handling de attempts
- `registry.spec.ts`: cada meerkat tiene ≥3 escenarios, `success_criteria` no vacío, `max_turns` en [3,15]

**Snapshot tests (DB-free)** — mismo patrón que `verify-meerkat-configs.ts` de session 47
- `scripts/verify-golden-scenarios.ts` — snapshot en `__snapshots__/golden-scenarios.json`. Incluye hash por meerkat.
- Cambio no intencional en escenarios = falla CI.

**Integration test (manual, no CI)**
- `scripts/smoke-golden-tests.ts` — corre 1 escenario real de nia contra v1. Se corre a mano cuando cambias runner/juez. Confirma end-to-end sin quemar $8.

## Calibración inicial (proceso, no test)

Escenario nuevo pasa por calibración antes de ser gate. **Nota: calibración usa N=5 (más rigor una vez), runtime usa N=3 (costo bajo cada vez).**

1. Correr contra versión estable actual **N=5 veces** (script one-off)
2. Score mediano debe estar en `[0.75, 0.95]`
   - <0.75 → rubric demasiado estricto, ajustar
   - =1.00 siempre → rubric no discrimina, agregar criterio negativo
3. Documentar en el escenario: `calibrated_at`, `calibrated_score` (la mediana observada)
4. Solo escenarios con `calibrated_at != null` cuentan en gate. Escenarios pendientes aparecen en admin UI como "calibrando" y NO afectan verdict.

Sin este paso los primeros meses el gate da falsos positivos.

## Admin UI — cambios

### `/admin/versiones` (existente)
- Nueva columna: "Baseline" con badge (Ready 45/45 / Running 30/45 / Stale / Missing)
- Botón "Re-run" por fila (dispara `/api/admin/golden-tests/rerun`)

### `ActivateVersionModal` (existente, extender)
- Panel superior nuevo: comparación active vs target con delta grande + verdict badge
- Sección "Escenarios que fallaron" (colapsable) con transcript link
- Campo `override_reason` visible solo si verdict == 'fail'
- Confirm de doble check si override

### `/admin/versiones/health` (nuevo)
- Últimos 20 runs con status/duración/costo
- Tasa de fallos técnicos últimas 24h
- Costo LLM del mes (acumulado por trigger)
- Alerta visible si `technical_fail_rate > 10%`

### `AgentVersionTab` (existente, extender)
- Ver baseline del meerkat de ese agente (informativo, no afecta pin)

## Modelos LLM y costos

| Componente | Modelo | Temp | Razón |
|------------|--------|------|-------|
| Usuario simulado | claude-haiku-4-5 | 0.7 | Variedad natural, barato, ~10 tokens/turno |
| Meerkat (test subject) | según `MEERKAT_CONFIGS` | según config | Fidelidad total al comportamiento real |
| Juez | claude-sonnet-4-6 | 0.1 | Consistencia en rubric structured JSON |

**Costo típico por scenario_run** (~7 turnos, N=1 attempt):
- Usuario: ~700 tokens × Haiku input + ~350 output ≈ $0.001
- Meerkat: depende del meerkat, promedio Haiku ~2K tokens ≈ $0.006
- Juez: ~3K input + 500 output Sonnet ≈ $0.020
- **Total ≈ $0.027 por scenario_run**

Baseline completo (45 × 2 × 3 = 270 runs) ≈ **$7.30**

## Alcance NO incluido

- Rollout gradual por porcentaje/cohorte (pilar 3)
- Dashboards de KPIs post-activación segmentados por versión (pilar 5)
- Golden tests para tools (executor) — próxima iteración
- Golden tests para prompts individuales del CES / motor conversacional
- UI para editar escenarios desde admin (a propósito: PR-gated)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Rubrics del juez mal calibrados → falsos positivos | Proceso de calibración obligatorio; escenarios sin `calibrated_at` no gatean |
| Cron worker se atasca en un scenario_run bug | Timeout hard 90s en runner + auto-fail; scenario queda con `error`, worker sigue |
| Escenarios "envejecen" (dejan de reflejar producción) | Runbook: revisar escenarios trimestralmente contra grabaciones reales |
| Costo explota si alguien pushea 5 versiones a la vez | Cap 500 scenario_runs/día + email alert |
| Judge determinístico pero racist/biased en scoring | Rubric explícito y estructurado; auditar output del juez trimestralmente |
| DB llena con transcripts | Purga de scenario_runs > 90 días (menos los del baseline vigente) |

## Follow-ups pendientes (post-implementación)

- Rewrite del cron `golden-tests-worker` a Vercel Queues cuando existan (rate limit + concurrencia nativa)
- Golden tests para el executor (tools)
- Dashboard "regressive scenarios" — cuáles fallan más frecuentemente al cambiar versión (metadata para mejorar meerkats)

## Referencias

- [[decisions_centinelia_session47]] — Model+Prompt Versioning (pilar 1) LIVE
- [[project_centinelia_evolution_framework]] — 5 pilares, roadmap
- `src/lib/vapi/meerkat-configs.ts` — MEERKAT_CONFIGS actual
- `src/lib/vapi/resolve-meerkat.ts` — resolver con cache 60s
- `src/components/admin/ActivateVersionModal.tsx` — modal a extender
- `scripts/verify-meerkat-configs.ts` — patrón de snapshot verification a replicar
