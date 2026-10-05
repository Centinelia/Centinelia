# Linters custom en `scripts/`

Tres linters preventivos escritos para enforzar patrones que, cuando se rompen, cuestan dinero silencioso o rompen la operación. Cada uno sigue el mismo molde: scan estático, allow-list explícita, test de red contra el repo real, y bloqueo en CI.

Correrlos manualmente:

```bash
npm run check:llm-logging
npm run check:ref-id-collisions
npm run check:cron-frequencies
```

Los tres corren automáticamente en cada PR a `main` via `.github/workflows/lint-custom-checks.yml`.

## 1. `check-llm-logging.mjs`

**Qué atrapa:** archivos en `src/` o `scripts/` que llaman al SDK Anthropic (`.messages.create` o `.messages.stream`) sin pasar por `logLlmCall`.

**Por qué importa:** sin logging, el gasto Anthropic queda invisible en `llm_call_log`, no se puede atribuir a cliente ni auditar contra la factura. Postmortem anclaje: 2026-09-08 (spike vision/extract) y 2026-10-05 (gap de $28/mes en 30 días por `scripts/eval/*` que escaparon al linter v1).

**Allow-list:** `DEFAULT_ALLOW_LIST` en el script. Hoy solo el linter mismo (meta-call).

**Red de contención:** `tests/scripts/check-llm-logging.test.ts` (9 tests). Incluye un test que escanea el repo real.

## 2. `check-ref-id-collisions.mjs`

**Qué atrapa:** en el mismo archivo, 2+ llamadas a `consumeAiOp` con mismo `source` y misma expresión literal de `reference_id`. Colisionan contra `ops_ledger_portal_ref_kind_uniq` → segundo cobro rechazado → undercharge silencioso.

**Por qué importa:** viola `[[feedback-pool-accuracy-top-priority]]`. Caso ancla: Beatriz Tortillería 15-30 ops en 34 días (hallazgo 2026-10-01, PR #103) y meefi-demo inbox-processor (hallazgo 2026-10-05, PR #113).

**Parser:** balanced-paren matching para soportar template literals con `${}`.

**Allow-list:** archivos con flows comprobadamente mutuamente exclusivos cross-request. Hoy vacío.

**Red de contención:** `tests/scripts/check-ref-id-collisions.test.ts` (14 tests).

## 3. `check-cron-frequencies.mjs`

**Qué atrapa:** cron definido en `vercel.json` que corre más seguido de un mínimo acordado documentado en `PROTECTED_CRONS`.

**Por qué importa:** una decisión de bajar frecuencia (como nash-monitor en PR #112, save ~$7-11/mes) se revierte por descuido o buena fe sin este guard.

**Parser cron:** 5-field standard. Soporta `*/N * * * *`, `0 */N * * *`, `0 N * * *`, `0 0 * * *`, `0 0 * * N`. Patrones no reconocidos devuelven `null` y el linter los marca como `unparseable`.

**Lista hoy:**

| Path | minMinutes | Razón |
|---|---|---|
| `/api/cron/nash-monitor` | 240 | PR #112: señales toleran 4h, anomaly/drift tienen throttle interno |

**Agregar un cron protegido:** editar `PROTECTED_CRONS` **en el mismo PR** que la decisión. El commit message es la justificación.

**Red de contención:** `tests/scripts/check-cron-frequencies.test.ts` (19 tests).

## Reglas de la casa

- Un linter nuevo requiere PR separado con: script + tests + integración a `npm run lint` + step en `.github/workflows/lint-custom-checks.yml`.
- El patrón mandatorio para cada linter: funciones puras exportadas (`find*` / `extract*`) para testeo, más un CLI entrypoint que solo corre si `process.argv[1]` apunta al script.
- Allow-lists requieren justificación en commit. No agregar entradas sin discutir.

Más contexto en `[[feedback-fixes-para-siempre]]` (regla dura 2026-10-05): todo fix debe hacer el patrón del bug imposible de re-introducir, no solo arreglarlo en el call site actual.
