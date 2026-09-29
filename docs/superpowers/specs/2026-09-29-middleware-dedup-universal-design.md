# Spec — Middleware universal de dedup para tool calls

**Fecha**: 2026-09-29
**Autor**: Claude (Opus 4.7) + Nazre
**Estado**: Approved (secciones 1-3), pending plan

---

## 1. Motivación y contexto

### 1.1 Incidente disparador

2026-09-29 18:35 UTC — Nelia (agente de voz de Tortillería Estrella, Sonnet 5.5)
invocó `registrar_incidencia` **dos veces** con `toolCallIds` distintos en 15.7
segundos para el mismo cliente (Tecate Six Cantú). El modelo enriqueció el
motivo entre invocaciones y decidió llamar la tool de nuevo — no fue reintento
de Vapi.

Impacto:
- 2 rows duplicadas en `client_incidents` (`c50068f0`, `12f09919`)
- 4 correos duplicados al encargado (2 recipients × 2 invocaciones)
- Doble cobro en `ops_ledger` (violó [[feedback-pool-accuracy-top-priority]])
- Reporte de falla falso: Nelia percibió que la primera no había respondido y
  disparó `reportar_falla`, alarmando a Nazre sin motivo.

### 1.2 Fix parcial ya aplicado (PR #78)

Dedup content-based **específico** a `registrar_incidencia`: ventana de 5 min
por `(agent_id, business_name normalizado, sucursal normalizada, contact_phone)`.
Shipped y verificado en prod.

### 1.3 Gap remanente (razón de este spec)

El mismo pattern del bug (modelo reinvocando tool con args enriquecidos) puede
disparar duplicados en **cualquier tool con side-effect** que no tenga dedup.
Auditoría de executors revela 9 tools con INSERT + email + charge sin
protección:

- `registrar_cliente_nuevo` (idéntico pattern al arreglado)
- `registrar_pedido`
- `crear_ticket`
- `agendar_cita`, `agendar_cita_externa`
- `crear_reporte`, `crear_lead`
- `marcar_no_llamar`
- `generar_punto_acuerdo`, `generar_acta_sesion`

Este spec propone un **wrapper único** (`withDedup()`) que envuelve TODOS los
tool handlers, aplica dedup content-based con heurística de campos, y persiste
el estado en una tabla dedicada. Reemplaza el dedup ad-hoc de
`registrar_incidencia` y protege tools futuros automáticamente.

**Fuera de scope**:
- Refactor de latencia de tools (~15s SMTP+IMAP sync) — trigger raíz upstream,
  tarea separada.
- Idempotencia por `toolCallId` puro — puede sumarse en fase 2 si content-based
  no cubre todos los casos observados.

---

## 2. Arquitectura

### 2.1 Flow

```
POST /api/voice/tools/<toolName>
  ↓
route.ts (handler existente)
  ↓
withDedup({ agentId, toolName, args, channel, toolCallId }, handler)
  ├─ (1) computeArgsHash(toolName, args) → sha256 hex
  ├─ (2) SELECT tool_call_dedup
  │       WHERE agent_id = ? AND tool_name = ? AND args_hash = ?
  │         AND expires_at > NOW()
  │       ORDER BY expires_at DESC
  │       LIMIT 1
  ├─ (3a) hit → return cached result_json (skip handler)
  ├─ (3b) miss:
  │       ├─ result = await handler(args)
  │       ├─ INSERT tool_call_dedup (result_json, expires_at = NOW() + window)
  │       └─ return result
  └─ (4) fail-open: si (2) o (3b-INSERT) tiran, ejecuta handler + log warning
```

### 2.2 Archivos afectados

**Nuevos** (`src/lib/tools/dedup/`):
- `hash-args.ts` — heurística de hash de args
- `dedup-config.ts` — overrides por tool (window, disable, keys)
- `with-dedup.ts` — wrapper principal
- `__tests__/hash-args.test.ts`
- `__tests__/with-dedup.test.ts`
- `__tests__/with-dedup.integration.test.ts`

**Migración**:
- `supabase/migrations/<ts>_tool_call_dedup.sql` — tabla + índices
- `supabase/migrations/<ts>_add_dedup_middleware_flag.sql` — feature flag org

**Modificados**:
- 10 archivos `src/app/api/voice/tools/*/route.ts` — aplicar wrapper
- Dispatcher de chat: `src/app/api/agent-chat/route.ts` (o donde despache tools)
- Dispatcher de email: `src/lib/inbox/processor.ts` (o equivalente)
- `src/lib/tools/executors/registrar-incidencia.ts` — remover dedup ad-hoc
- `src/lib/tools/executors/__tests__/registrar-incidencia.test.ts` — cleanup
  de los 5 tests de dedup migrados a `with-dedup.test.ts`

**Observability**:
- `src/lib/monitoring/dedup-drift.ts` — Nash alert si INSERT rate crece
- Cron cleanup: nueva ruta `/api/cron/dedup-cleanup` (o extender existing)

Total estimado: ~18-22 archivos.

### 2.3 Fail-open explícito

Cualquier error del middleware (SELECT falla, INSERT falla, hash lanza, tabla
no existe) → **log warning + ejecutar handler normal**. Nunca peor que sin
middleware. Trade-off: si el middleware está roto, los duplicados vuelven a ser
posibles, pero no rompemos operación.

---

## 3. Data model

### 3.1 Tabla `tool_call_dedup`

```sql
CREATE TABLE tool_call_dedup (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  tool_name    text NOT NULL,
  args_hash    text NOT NULL,               -- sha256 hex (64 chars)
  result_json  jsonb NOT NULL,              -- payload que se devuelve al modelo
  channel      text NOT NULL,               -- 'voice' | 'chat' | 'email'
  tool_call_id text,                        -- de Vapi (audit), nullable
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  expires_at   timestamptz NOT NULL
);

-- Lookup principal: 3 columnas + ventana temporal
CREATE INDEX idx_tool_call_dedup_lookup
  ON tool_call_dedup (agent_id, tool_name, args_hash, expires_at DESC);

-- Cleanup cron
CREATE INDEX idx_tool_call_dedup_expires ON tool_call_dedup (expires_at);
```

**Retención**: cleanup cron hourly borra rows con `expires_at < NOW() - INTERVAL '1 hour'`.

### 3.2 Feature flag

```sql
ALTER TABLE organizations
  ADD COLUMN dedup_middleware_enabled boolean NOT NULL DEFAULT false;
```

Rollout gradual (ver §6). Cuando `false`, el wrapper es no-op (ejecuta handler
directo sin lookup ni INSERT).

---

## 4. Hash de args (heurística)

### 4.1 Definición

```ts
// src/lib/tools/dedup/hash-args.ts
import { createHash } from 'crypto';

const IDENTITY_KEYS = /^(contact_phone|phone|telefono|contact_email|email|correo|business_name|negocio|contact_name|nombre|sucursal|cliente_id|.*_id)$/i;
const DETAIL_KEYS   = /^(motivo|notas|detalles|descripcion|mensaje|texto|transcript|resumen|observaciones|razon|contexto)$/i;
const TIME_KEYS     = /^(fecha|hora|created_at|scheduled_at|.*_at|.*_time)$/i;

const FREE_TEXT_MAX_LEN = 200;

function normalize(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function keepKey(k: string, v: unknown): boolean {
  if (DETAIL_KEYS.test(k) || TIME_KEYS.test(k)) return false;
  if (typeof v === 'string' && v.length > FREE_TEXT_MAX_LEN) return false;
  return true;
}

function pickKept(args: Record<string, unknown>, override?: { identity_keys?: string[]; detail_keys?: string[] }): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const explicit = new Set(override?.identity_keys ?? []);
  const explicitDetail = new Set(override?.detail_keys ?? []);
  for (const [k, v] of Object.entries(args)) {
    // Override tiene prioridad sobre heurística
    if (explicit.has(k))          { kept[k] = normalize(v); continue; }
    if (explicitDetail.has(k))    { continue; }
    if (!keepKey(k, v))           { continue; }
    if (IDENTITY_KEYS.test(k))    { kept[k] = normalize(v); }
    else                          { kept[k] = v; }
  }
  return kept;
}

export function computeArgsHash(
  toolName: string,
  args: Record<string, unknown>,
  override?: { identity_keys?: string[]; detail_keys?: string[] },
): string {
  const kept = pickKept(args, override);
  const canonical = JSON.stringify(kept, Object.keys(kept).sort());
  return createHash('sha256').update(`${toolName}::${canonical}`).digest('hex');
}
```

### 4.2 Rationale de la heurística

- **Identity keys** identifican QUIÉN o QUÉ. Reintentos del modelo suelen
  preservarlos.
- **Detail keys** son el contenido enriquecido — cambian entre invocaciones.
  Ignorarlos hace que el hash matchee aunque el modelo mejore el motivo.
- **Timestamps** cambian aun cuando el evento es el mismo.
- **Free-text >200 chars** típicamente son transcripts/resumen — mismo caso.

### 4.3 Cobertura del caso Tecate

Args del incidente:
```
call 1: { business_name: "Tecate Six Cantú", contact_phone: "8129262462",
          address: "Calle Cruz Potensada...", motivo: "Ya tiene unos días..." }
call 2: { business_name: "Tecate Six Cantú", contact_phone: "8129262462",
          address: "Calle Cruz Potensada...", motivo: "...El supervisor vino hace 3 días..." }
```

Post-heurística:
- `business_name` → identity, normalized: "tecate six cantu"
- `contact_phone` → identity: "8129262462"
- `address` → no matchea IDENTITY ni DETAIL (fallback: incluir tal cual, normalizado)
- `motivo` → detail, ignorado

Ambas calls generan el **mismo hash** ✓ → dedup activa en el 2do call.

---

## 5. Config por tool

```ts
// src/lib/tools/dedup/dedup-config.ts

export type DedupOverride = {
  window_min?:    number;    // default 5
  disable?:       boolean;   // opt-out
  identity_keys?: string[];  // añade/reemplaza heurística
  detail_keys?:   string[];  // añade/reemplaza heurística
};

export const DEFAULT_WINDOW_MIN = 5;

export const DEDUP_CONFIG: Record<string, DedupOverride> = {
  // Tools con args no capturados por heurística estándar
  registrar_pedido: { identity_keys: ['contact_phone', 'items_hash'] },
  agendar_cita:     { identity_keys: ['contact_phone', 'fecha_hora'] },

  // Opt-outs explícitos
  reportar_falla:   { disable: true },  // cada falla es única por naturaleza
  crear_reporte:    { disable: true },  // reportes ejecutivos suelen ser únicos por rango de fechas
};

export function getDedupConfig(toolName: string): DedupOverride {
  return DEDUP_CONFIG[toolName] ?? {};  // {} = usa heurística default
}
```

Notas:
- `items_hash` en `registrar_pedido` requiere que el caller lo compute previo
  al hash (sha256 corto de los items ordenados). Simple helper en el executor.
- Tools no listadas usan heurística default (5 min, keys automáticos).
- `disable: true` desactiva dedup para tools donde cada call debe ser único.

---

## 6. Rollout

### 6.1 Fases

| Fase | Alcance | Duración monitor | Criterio de éxito |
|------|---------|-----------------|-------------------|
| 1 | Enable flag en **Tortillería** solamente | 48 h | Cero duplicados en `client_incidents`; hit rate visible en `tool_call_dedup`; sin errores en Vercel logs |
| 2 | Pilotos activos (AC Proyectos, Santiago NL, Meefi) | 3-5 días | Idem por org |
| 3 | Global + `default=true` en nuevos orgs | 1 semana | Drift detector Nash sin alertas |
| 4 | DROP feature flag + código de fallback | Permanente | Wrapper siempre on |

### 6.2 Reversal path

Cualquier fase → set flag `false` en el org afectado. El wrapper se vuelve
no-op inmediatamente. Sin re-deploy.

Si el bug está en el wrapper (no en el flag): PR de revert al último commit
pre-middleware; migración de la tabla queda (no molesta).

### 6.3 Convivencia con el dedup ad-hoc actual

`registrar_incidencia` tiene dedup interno (shipped hoy). Cuando el middleware
esté ON en Tortillería:
1. Middleware corre primero → si hit, retorna sin llegar al executor
2. Si miss → executor corre; su dedup interno queda como no-op (query no
   encuentra rows recientes porque el middleware ya cacheaba)

Idempotente. En fase 4 (flag droppeada), removemos el dedup interno del executor.

### 6.4 Cleanup cron

```
GET /api/cron/dedup-cleanup
  DELETE FROM tool_call_dedup WHERE expires_at < NOW() - INTERVAL '1 hour'
```

Programado en `vercel.json` cada hora. Batch pequeño (~10-100 rows/org/hora).

---

## 7. Testing

### 7.1 Unit tests

**`hash-args.test.ts`** (mínimo 12 casos):
- Args idénticos → hash igual
- Motivo distinto (caso Tecate) → hash igual (motivo ignored)
- Phone distinto → hash distinto
- Business normalize (acentos + case) → hash igual
- Free-text >200 chars → ignored
- Timestamps → ignored
- Override `identity_keys` → respeta lista override
- Override `detail_keys` → respeta lista override
- Args con nested objects/arrays → hash estable (canonical JSON con sort)
- Args con null/undefined → tratados consistente
- Diferentes `toolName` con mismos args → hash distinto
- Args vacío → hash estable

**`with-dedup.test.ts`** (mínimo 10 casos):
- Miss → ejecuta handler, INSERT, retorna resultado
- Hit dentro de ventana → retorna cached, NO ejecuta handler
- Hit fuera de ventana → miss efectivo
- SELECT falla → fail-open + log warning
- INSERT falla → fail-open (retorna resultado sin cachear) + log warning
- `disable: true` en config → skip dedup completo
- Override `window_min` respetado
- Flag `dedup_middleware_enabled=false` → no-op (ejecuta handler, no toca tabla)
- Multi-channel: mismo hash + agent + tool en voice y chat → 2 rows separadas? o comparten?
  **Decisión**: comparten (channel es audit only, no factor de identidad)
- toolCallId se persiste en la row (trace)

### 7.2 Integration test

**`with-dedup.integration.test.ts`** contra Supabase local:
- `assertNotProdOrAllowed()` en beforeAll
- Setup: crear voice_agents + organization con flag ON
- Test: 2 llamadas consecutivas al mismo hash → 1 row en `tool_call_dedup`,
  2do call retorna cached
- Test: TTL — call, wait `window+1s`, call otra vez → 2 rows (miss)
- Cleanup en afterAll

### 7.3 Regression test específico Tecate

Reproducir el escenario exacto contra el wrapper + `registrar_incidencia`:
- Call 1: motivo "Ya tiene unos días"
- Call 2: motivo enriquecido (mismos identity fields)
- Assert: `client_incidents` con 1 row, `tool_call_dedup` con 1 row, 2do call
  retorna resultado idéntico al primero.

### 7.4 Cleanup de tests obsoletos

Los 5 tests de dedup en `registrar-incidencia.test.ts` (agregados hoy) se
mueven a `with-dedup.test.ts` verificando que el middleware provee el mismo
comportamiento. El executor queda sin dedup interno en fase 4.

### 7.5 Schema drift guard

Test estático que enumera todos los tools registrados en `src/lib/tools/registry.ts`
y verifica que cualquiera con `sideEffect: true` o `charges: true` esté
cubierto por el wrapper (grep de `withDedup(` en el route.ts correspondiente).
Falla en CI si alguien agrega una tool nueva con side-effects sin envolverla.

---

## 8. Observability

### 8.1 Logging

Cada hit y cada fail-open loguea:
```
[dedup] hit tool=registrar_incidencia agent=<uuid> channel=voice age_s=12
[dedup] fail-open reason=select_error err=<msg> tool=<name>
```

### 8.2 Drift detector Nash

Nueva check en Nash monitor: contar rows creadas en `tool_call_dedup` por org
por hora vs baseline (4 semanas previas). Alerta si:
- **spike**: current > 3× baseline (indica modelo reinvocando tools demasiado
  → prompt engineering issue o cambio de modelo)
- **cero hits** por >24 h en un org con volumen normal (indica middleware roto
  → fail-open silencioso)

Extiende `src/lib/ops/consumption-audit.ts` pattern.

### 8.3 Portal admin

Nueva vista en `/admin/dedup` con:
- Tabla de últimas 100 rows agrupadas por (agent, tool_name)
- Contador de hits por día
- Filtro por org

Fuera de scope del MVP: agregarlo en fase 3 después del rollout.

---

## 9. Interacción con brainstorming

Este spec **NO cubre**:
1. **Latencia raíz** de tools con SMTP+IMAP sync (~15s). Es el trigger upstream
   del bug. Requiere refactor a background jobs — spec separado.
2. **Idempotencia por `toolCallId` puro** — puede sumarse como layer 1 antes
   del content-based si Vapi reintenta con mismo ID. No visto en producción
   aún, pero registrable.
3. **Rate limiting** de tool calls por conversación. Diferente problema
   (previene abuse, no dedup).

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| Hash colisiona → tool distinta retorna cached de otra | Muy baja (sha256 + toolName en la clave) | Test unit verifica que distintos toolName siempre difieren |
| Fase 1 corrompe pool de Tortillería si middleware retorna cached incorrecto | Media | Flag `false` por default; rollback en 1 comando. Tests exhaustivos antes de enable. |
| Falso hit por heurística que ignora un campo clave | Media | Override `identity_keys` explícito por tool. Auditar cada tool antes de Fase 2. |
| Tabla crece descontrolada si cron falla | Baja (retención corta) | Cron monitor; INDEX por expires_at. |
| Wrapper introduce ~20ms de latencia por lookup | Alta (esperada) | Trade-off aceptable. Voice tools ya toleran ~15s. Chat/email tolerantes. |
| Multi-channel: hit en voice retorna cached a chat con formato distinto | Media | Testear cross-channel. Si formatos difieren mucho, separar por channel en el hash. |

---

## 11. Success criteria

- [ ] Wrapper ejecuta y retorna cached correctamente (unit + integration)
- [ ] Cero rows duplicadas en `client_incidents`/`voice_orders`/`voice_appointments`
      durante 48h de Fase 1 (Tortillería)
- [ ] Hit rate visible y creciente en `tool_call_dedup` para tools activos
- [ ] Cero pool accuracy issues detectados por Nash drift detector
- [ ] Regression test Tecate pasa
- [ ] Schema drift guard falla en CI si tool con side-effect no está envuelta

---

## 12. Preguntas abiertas (para plan)

- Cron cleanup: ¿nueva ruta o extender un cron existente? — decidir en plan
- Portal admin view: incluir en MVP o Fase 3? — Fase 3 (fuera del MVP)
- Config `DEDUP_CONFIG`: ¿un archivo o distribuido en cada executor? — un
  archivo shared para revisar sin buscar (spec §5)
- `items_hash` para `registrar_pedido`: helper en `hash-args.ts` o en el
  executor? — helper compartido para reuso (agendar_cita también podría)
