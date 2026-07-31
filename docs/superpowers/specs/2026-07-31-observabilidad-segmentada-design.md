# Observabilidad segmentada por versión / flag — pilar 5

**Autor:** Nazre + Opus 4.7 (1M)
**Fecha:** 2026-07-31
**Status:** Design approved, pending implementation plan
**Pilar del evolution framework:** 5 de 5

---

## Contexto

Con pilares 1 (versioning), 3 (feature flags + auto-promote) y 4 (golden tests) en producción, ya podemos publicar múltiples versiones de un meerkat y hacer rollout gradual. Falta el ojo que nos diga si una versión está degradando en producción real: dashboards que rebanen KPIs por `meerkat_version × active_flags` para que, cuando algo se caiga, sepamos qué cohorte revertir.

Este spec cierra ese hueco.

## Problema

`voice_calls` hoy no traquea qué versión de meerkat ni qué flags estaban activos cuando atendió cada llamada. Sin esa atribución por-call, todo dashboard segmentado es imposible. La tabla `meerkat_active_versions` solo dice la versión activa *ahora*; `meerkat_version_history` solo tiene transiciones globales. No hay evaluation log de flags. La única señal de calidad por call es `ces_data` (JSONB post-llamada); no hay latencia capturada.

## Objetivo

Dashboard admin en `/admin/observabilidad` que muestre, por cada meerkat, las métricas críticas (volumen, autonomía, CES, costo, latencia) segmentadas por `meerkat_version` con filtro secundario por `flag_key`. Ventana default 24h rolling, selector a 7d / 30d / desde activación.

## No-objetivos (MVP)

- **Alertas.** Solo dashboard. Alertas quedan para pilar 5.1 después de calibrar thresholds con data real.
- **Snapshots precomputados.** Todo en vivo por page load. Migrar a snapshots si el volumen degrada la latencia del dashboard.
- **Métricas de office / chat / email.** Solo voice_calls en MVP. Los otros canales se agregan cuando pilar 1 los cubra con versioning.

## Diseño

### Arquitectura

Un solo eje de cohorte: `(meerkat_id, meerkat_version, flag_keys[])` capturado al momento de la llamada. Pilar 1 no separa `model_version` de `prompt_version` — cada bump de `meerkat_version` encapsula ambos.

Flujo:
1. Webhook Vapi → resuelve `meerkat_id` del agent + `meerkat_version` activa + `active_flags` para esa org → snapshot en `voice_calls` al insert.
2. Dashboard `/admin/observabilidad` → queries en vivo agregadas por `(meerkat_id, meerkat_version)` con filtro secundario por `flag_keys`.
3. Backfill best-effort de calls pre-deploy: script one-shot llena `meerkat_id` + `meerkat_version` usando `meerkat_version_history` al `created_at` de cada call. `active_flags = null` para pre-deploy.

### Esquema DB

Migración `migrations/20260731_observability.sql`:

```sql
ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS meerkat_id       text,
  ADD COLUMN IF NOT EXISTS meerkat_version  int,
  ADD COLUMN IF NOT EXISTS active_flags     jsonb,
  ADD COLUMN IF NOT EXISTS latency_ms_p50   int,
  ADD COLUMN IF NOT EXISTS latency_ms_p95   int;

CREATE INDEX IF NOT EXISTS voice_calls_meerkat_version_idx
  ON voice_calls (meerkat_id, meerkat_version, created_at DESC);

CREATE INDEX IF NOT EXISTS voice_calls_flags_gin_idx
  ON voice_calls USING gin (active_flags);
```

Sin tabla nueva. Todo el aggregation en vivo desde `voice_calls`. Los índices dan queries <50ms hasta ~1M rows.

Nullable + best-effort: filas pre-deploy y filas donde el resolver falle guardan `null`. Dashboard tiene toggle "incluir sin atribución (n=X)" para no ocultar volumen.

**Estado:** migración ya corrida en Supabase el 2026-07-31.

### Captura en webhook

En `src/app/api/voice/webhook/route.ts`, junto al insert existente de `voice_calls` (~line 151):

```ts
import { resolveMeerkatVersionForAgent } from '@/lib/feature-flags/version-flag-resolver';
import { getMeerkatIdForAgent } from '@/lib/vapi/meerkat-map'; // helper nuevo
import { evaluateFlagsForOrg } from '@/lib/feature-flags/evaluator';

const meerkatId    = await getMeerkatIdForAgent(resolvedAgentId);
const meerkatVer   = meerkatId ? await resolveMeerkatVersionForAgent(resolvedAgentId, meerkatId) : null;
const activeFlags  = agent?.portal_email
  ? await evaluateFlagsForOrg(agent.portal_email)
  : null;
const latency      = call?.metrics?.latencyMs ?? {};

await supabase.from('voice_calls').insert({
  ...camposExistentes,
  meerkat_id:       meerkatId,
  meerkat_version:  meerkatVer,
  active_flags:     activeFlags,
  latency_ms_p50:   latency.p50 ?? null,
  latency_ms_p95:   latency.p95 ?? null,
});
```

**Fallbacks silenciosos:** cualquier resolver que falle guarda `null` en su campo. El insert de la call es sagrado — un webhook nunca falla por falta de metadata de observabilidad.

**Idempotencia:** el webhook ya es idempotente por `vapi_call_id unique`. Nada que cambiar.

**A definir en implementación:** `getMeerkatIdForAgent` y `evaluateFlagsForOrg` puede que no existan con esa firma. Si `resolveMeerkatVersionForAgent` ya deriva el `meerkat_id` internamente, refactorizar para exponer ambos.

### Backfill best-effort

Script `scripts/backfill/observability-voice-calls.ts` (no cron, manual):

```
Para cada voice_call sin meerkat_id (batches de 500):
  1. lookup agent_id → meerkat_id (via mapa de roles del agent)
  2. lookup meerkat_version_history WHERE meerkat_id = X AND changed_at <= call.created_at
     ORDER BY changed_at DESC LIMIT 1
     → si vacío: version = 1 (baseline pre-versioning)
  3. active_flags = null (no reconstruible)
  4. latency_ms_p50/p95 = null (Vapi no re-expone historial)
  5. UPDATE voice_calls SET meerkat_id=X, meerkat_version=N WHERE id=call.id
Repetir hasta terminar.
```

Corre una sola vez después del deploy del webhook. Idempotente (skip rows con `meerkat_id IS NOT NULL`). Dashboard muestra badge "atribución parcial" cuando la ventana incluye rows con `active_flags IS NULL`.

### UI `/admin/observabilidad`

Server component. Gate por cookie `Centinelia_admin` == `ADMIN_SECRET`, mismo patrón que el resto del admin.

**Controles arriba:**
- Selector ventana: 24h (default) / 7d / 30d / desde-activación
- Filtro meerkat: All / nia / noah / ... (chips)
- Filtro flag: All / meerkat.nia.v2 / handoff.auto.v1 / ...
- Toggle "incluir sin atribución (n=X)"

**Body — una tabla por meerkat en la selección:**

```
NIA
Version | Calls | Autonomía | CES avg | Costo/call | p50 lat | p95 lat
v1      | 1204  | 87.2%     | 4.31    | $0.14      | 820ms   | 2100ms
v2      |  156  | 91.8% ▲   | 4.42 ▲  | $0.16 ▲    | 780ms   | 1900ms
sin attr|   38  | 84.2%     | —       | $0.14      | —       | —
```

- Flechas ▲/▼ vs versión anterior del mismo meerkat.
- Row "sin atribución" solo aparece si el toggle está ON.
- Cada version-row linkea a `/admin/versiones/<meerkat>`.

**Queries:** una por meerkat, `GROUP BY meerkat_version`. Aggregates:
- Volumen: `count(*)`
- Autonomía: `count(*) filter (where outcome not in ('transferred','escalated_whatsapp')) / count(*)`
- CES avg: `avg((ces_data->>'overall')::numeric)` (asume `overall` como campo agregado del ces_data; si no existe, usar promedio de las 6 dimensiones)
- Costo: `avg(cost_usd)`
- Latencia: `percentile_cont(0.5)` y `percentile_cont(0.95)` sobre `latency_ms_p95`

### Testing

**Unit:**
- Aggregation query builder da SQL correcto por cada combinación de filtros.
- Fórmula de autonomía: outcomes `transferred` y `escalated_whatsapp` cuentan como no-autónomos.
- Flag filter: `active_flags @> jsonb '["meerkat.nia.v2"]'` filtra correctamente.

**Integration:**
- Insert 3 voice_calls con `(meerkat_id=nia, meerkat_version=1/1/2, distintos outcomes/CES/costos/latencias)`.
- Query del dashboard devuelve 2 rows (v1 con n=2, v2 con n=1) con métricas exactas.
- Toggle "sin atribución" agrega row cuando hay rows con `meerkat_id IS NULL`.

### Rollout

1. Migración ya corrida en Supabase. ✓
2. Deploy webhook con captura de snapshot.
3. Smoke test: 1 call a Nia → último row de `voice_calls` tiene `meerkat_id='nia'`, `meerkat_version=1`, `active_flags=[]`, `latency_ms_*` populated.
4. Correr backfill script en prod (`npx tsx scripts/backfill/observability-voice-calls.ts`).
5. Deploy dashboard `/admin/observabilidad`.
6. Smoke check: dashboard carga <500ms con 24h de data real, muestra Nia v1.

Sin flag gate propio — es solo admin UI + cols en voice_calls. Reversión: rollback deploy + `UPDATE voice_calls SET meerkat_id=null...` opcional (no destructivo).

## Riesgos

- **`ces_data->>'overall'` puede no existir.** El schema del JSONB depende de cómo `ces-eval.ts` lo escribe. Verificar en implementación; fallback = avg de las 6 dimensiones.
- **`call.metrics.latencyMs` puede tener otra ruta en el payload de Vapi.** Verificar contra un webhook real; si no viene por default, activar métricas en la config del assistant.
- **Backfill lento si voice_calls tiene >100k rows.** Batches de 500 con sleep 200ms deberían tomar <10 min. Correr fuera de horario pico.

## Trabajo futuro (post-MVP)

- Alertas (pilar 5.1): thresholds por métrica con delta vs versión anterior.
- Snapshots diarios precomputados si volumen crece.
- Extender a chat/email/office cuando pilar 1 cubra esos canales.
- Comparativa lado-a-lado entre 2 versiones seleccionadas (v2 vs v3).
- Distribución de outcomes por versión (stacked bar).

## Referencias

- Pilar 1 versioning: `docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md`
- Pilar 3 flags: `docs/superpowers/specs/2026-07-31-feature-flags-rollout-design.md`
- Pilar 4 golden tests: `docs/superpowers/specs/2026-07-30-golden-tests-suite-design.md`
- Webhook a modificar: `src/app/api/voice/webhook/route.ts:151`
- Resolver existente: `src/lib/feature-flags/version-flag-resolver.ts`
- Evaluator existente: `src/lib/feature-flags/evaluator.ts`
