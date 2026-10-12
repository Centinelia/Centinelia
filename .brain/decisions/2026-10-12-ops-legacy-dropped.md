---
name: 2026-10-12-ops-legacy-dropped
description: Dual-system de billing de ops (legacy aggregated columns + ops_ledger) consolidado a fuente única = ops_ledger. Columnas y RPC legacy eliminadas de Postgres. Supersede el diseño híbrido 2026-08.
type: decision
owner: nazre
decided_on: 2026-10-12
last_verified: 2026-10-12
---

# Decisión — ops_ledger es la ÚNICA fuente para consumo de ops

**Regla:** cualquier lectura, escritura o gating de ops (chat, email, voice tools, agent tasks, admin commands) pasa EXCLUSIVAMENTE por el ledger event-sourced (`ops_ledger`), su mirror agregado (`account_ops`), y los RPCs oficiales (`consume_pool_ops`, `apply_ops_ledger_entry`, `get_ops_pool_balance`, `get_ops_pool_cap`). Las columnas aggregated que coexistían (counters en `organizations` y `voice_agents`) ya no existen en Postgres.

## Contexto detonante

Entre 2026-08 y 2026-10-09 hubo dos sistemas corriendo en paralelo:

- **Legacy aggregated:** `organizations.monthly_ops_pool`, `organizations.monthly_ops_used`, `voice_agents.ai_ops_used`, RPC `consume_ai_ops`. Counters acumulados a mano por cada call site de billing.
- **Event-sourced ledger:** `ops_ledger` + `account_ops` (mirror) + RPC `consume_pool_ops`. Cada operación se escribe como fila con amount+ref+source, el balance se deriva.

El flag `organizations.ops_ledger_enabled` servía de switch per-org. Al 2026-10-09 las 15/15 orgs activas estaban en ledger, el path legacy del `consumeAiOp` era código muerto, pero las columnas legacy seguían recibiendo escrituras stale desde webhook billing, admin command-actions, change-plan, portal UI, varios crons, PDFs y libs de annual-contracts.

Síntoma concreto que detonó la limpieza: AC Proyectos aparecía con `monthly_ops_used = 0` cuando el ledger real tenía 1,061 rows (balance real 4,647). El counter stale bailaba entre valores que no reflejaban nada real durante los 3 días de desarrollo de la Fase 1 con Camila.

## Alcance de la limpieza (PRs #131 + #132, 2026-10-09 → 2026-10-12)

**Fase 1 (consumeAiOp):** eliminación del path legacy en `src/lib/ai/ops-guard.ts`. consumeAiOp ahora llama a `consume_pool_ops` siempre; si no hay portal_email, devuelve `ok=false` sin cobrar (vs silent-skip previo).

**Fase 2–3 (call sites externos):** 30+ archivos migrados en `src/`. Resumen:
- `src/app/api/billing/webhook/route.ts` — removidas 6 escrituras dual-write; preservado `ai_ops_limit` (config del plan).
- `src/lib/admin/command-actions.ts`, `src/app/api/portal/[token]/change-plan/route.ts`, `src/app/api/portal/[token]/agentes/route.ts` — writes a ledger via `apply_ops_ledger_entry`.
- `src/lib/portal/pool-status.ts` + 5 archivos del portal UI — reads via `account_ops` + `get_ops_pool_balance`.
- Crons: `ops-alerts`, `pool-projection-alerts`, `annual-contracts-weekly-overage-digest`, `infra-alerts`, `heartbeat`, `learn`, `weekly-insights`, `nox-brief` — agregación desde `ai_ops_log` donde se necesitaba breakdown per-agente.
- Admin dashboards + PDFs: `admin/{inicio,ledger,clientes,facturacion,facturacion/[id]}/page.tsx`, `src/lib/pdf/reporte.tsx`, `src/app/api/portal/[token]/pdf/reporte/route.ts`.
- Libs: `quota-email.ts`, `director-tools.ts`, `email/annual-contracts.ts`, `monitoring/pool-provisioning-drift.ts`, `annual-contracts/{pool-consume,service,lifecycle}.ts`.

**Fase 4 (DROP destructivo) — aplicada 2026-10-12 17:08 UTC** vía migración `supabase/migrations/20261009120000_drop_legacy_ops_billing_columns.sql`:

```sql
ALTER TABLE organizations DROP COLUMN IF EXISTS monthly_ops_pool;
ALTER TABLE organizations DROP COLUMN IF EXISTS monthly_ops_used;
ALTER TABLE voice_agents  DROP COLUMN IF EXISTS ai_ops_used;
DROP FUNCTION IF EXISTS public.consume_ai_ops;
```

Ventana de observación cumplida: 65h entre merge de PR #132 (2026-10-09 23:26 UTC) y aplicación (2026-10-12 17:08 UTC), > 48h del umbral acordado.

## Campos preservados (NO drop)

Confusión común a futuro: estos nombres SUENAN legacy pero NO lo son.

- **`voice_agents.ai_ops_limit`** — CONFIG del plan por agente. Lo lee `get_ops_pool_cap()` para calcular el cap total de la org (SUM × 2 en stripe, override en annual_prepaid). Es config, no estado.
- **`organizations.monthly_minutes_used`** — scope minutos tiene su propio ledger (`minutes_ledger`, 393 rows al cierre). Esta decisión NO toca minutos.
- **`annual_contracts.monthly_ops_pool`** — campo contractual del plan annual_prepaid. Distinto del campo homónimo que estaba en `organizations` (ese sí se droppeó). Lo lee `get_ops_pool_cap()` cuando `billing_model='annual_prepaid'`.
- **`organizations.ops_ledger_enabled`** — hoy siempre `true`. Pendiente drop en migración separada cuando queramos simplificar.

## Reversión

- Supabase PITR 7 días cubre todo el dominio. Snapshot pre-DROP recuperable hasta 2026-10-19.
- Si algo rompe en prod: restore PITR O re-crear columnas con default 0. Los counters se repopulan solos vía nuevo consumo del ledger; el histórico íntegro queda en `ops_ledger`.

## Reglas duras post-decisión

1. **Para gating** (¿puede ejecutar la operación?): usar `consumeAiOp()` de `src/lib/ai/ops-guard.ts` o el RPC `consume_pool_ops` directamente.
2. **Para balance** (¿cuántas ops le quedan?): usar `get_ops_pool_balance(p_portal_email)` o leer de `account_ops.ops_balance`.
3. **Para cap del plan** (¿cuánto son el límite?): usar `get_ops_pool_cap(p_portal_email)`. Esto respeta annual vs stripe + el override 2× stripe.
4. **Para historial** (¿qué consumió el cliente?): leer de `ops_ledger` filtrando por `portal_email` + `created_at`.
5. **Para audit** (¿se intentó cobrar y qué pasó?): leer de `ai_ops_log` — incluye intentos fallidos (RPC error, bypass, duplicate_key UNIQUE constraint).
6. **Para bypass per-org** (ej. pre-pago, prueba): setear `organizations.billing_paused_at`. Ver `.brain/policies/billing-bypass-from-claude-code.md`.
7. **Agregar escrituras directas a counters agregados queda prohibido.** El ledger es append-only + los agregados son derivados.

## Related

- `[[handoff-billing-cleanup-fase1-2-parcial-2026-10-09]]` — handoff del arranque de la limpieza, mapa de archivos tocados.
- `.brain/policies/billing-bypass-from-claude-code.md` — políticas de bypass per-org y per-call.
- `[[feedback-pool-accuracy-top-priority]]` — pool accuracy es prioridad #1, el ledger lo garantiza.
- `[[feedback-fixes-para-siempre]]` — por qué dropear físicamente las columnas en lugar de dejarlas "unused": elimina la posibilidad de re-introducir dual-write a futuro.
