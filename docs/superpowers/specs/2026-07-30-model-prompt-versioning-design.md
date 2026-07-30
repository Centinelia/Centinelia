# Model + Prompt Versioning — Design Spec

**Fecha:** 2026-07-30
**Autor:** Nazre + Claude Opus 4.7 (brainstorm)
**Contexto padre:** `project_centinelia_evolution_framework.md` (5 pilares para escalar sin romper prod). Este spec cubre el **pilar 1: versionar todo lo que consume el runtime**.

## Problema

Hoy `MEERKAT_MODEL_CONFIG` vive hardcoded en `src/lib/vapi/sync.ts:355`. Cualquier ajuste al modelo, temperatura o parámetros de voz de un meerkat:

1. Requiere git commit + deploy para aplicarse.
2. Afecta a **todos** los agentes de esa cohorte de golpe (no hay rollout gradual).
3. Rollback = git revert + deploy (típicamente 3-8 minutos, más el tiempo de detectar el problema).
4. No hay forma de "proteger" un agente crítico (p. ej. Palacio Municipal de Monterrey) de un rollout global que le rompe su comportamiento validado.

Cuando Centinelia escale a 500-1000 agentes, la ventana entre "detecté regresión" y "regresión revertida" es donde se pierde reputación con clientes.

## Objetivo

**Rollback instantáneo (sin re-deploy) cuando un cambio de modelo o config de meerkat degrada llamadas.** Secundario: permitir que agentes específicos se queden en una versión validada mientras el resto avanza.

## Decisiones de diseño (fijadas en brainstorm)

| Decisión | Elección | Razón |
|---|---|---|
| Escenario #1 a resolver | Rollback instantáneo | Es el que produce daño real hoy; los otros son bonus. |
| Alcance de la versión | Modelo + prompt renderizado + features JSONB | Voice/tools/STT se derivan de estos; capturan el 90% de rupturas. |
| Unidad de versión | Por cohorte de meerkat | Balance entre granularidad (evitar 1 chain per agente = 200 chains) y control (una sola chain global es muy tosca). |
| Estrategia de rollout | Latest por default + pinning opcional per-agent | Rollouts fluidos; agentes críticos protegibles. |
| Storage del contenido | Código (git) + puntero de versión en DB | Rollback = SQL flip sin deploy porque ambas versiones YA están en el bundle. Auditabilidad vía git blame. |
| Alcance del MVP | Approach B: backend + Portal admin UI completo | No dejar UI a medias. |

## Arquitectura

### Data model (2 tablas nuevas)

```sql
CREATE TABLE meerkat_active_versions (
  meerkat_id       TEXT PRIMARY KEY,           -- 'nia', 'noah', 'nox', ...
  active_version   INT  NOT NULL,              -- apunta a MEERKAT_CONFIGS['nia'][N] en código
  activated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by     TEXT,                       -- email del admin que activó
  notes            TEXT
);

CREATE TABLE meerkat_version_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meerkat_id   TEXT NOT NULL,
  from_version INT,                            -- NULL en el primer activate
  to_version   INT NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by   TEXT,
  reason       TEXT                            -- 'rollout' | 'rollback' | texto libre
);
CREATE INDEX idx_meerkat_history_meerkat ON meerkat_version_history(meerkat_id, changed_at DESC);
```

### Extensión del schema existente

Ningún cambio de columnas. Un solo campo nuevo en `voice_agents.features` (JSONB):

- `pinned_meerkat_version: number | null` — si está seteado, el resolver ignora el `active_version` global y usa esta versión específica para ese agente.

### Código

**`src/lib/vapi/meerkat-configs.ts` (nuevo)** — el actual `MEERKAT_MODEL_CONFIG` se mueve aquí y se convierte en `Record<meerkat_id, Record<version_number, MeerkatModelConfig>>`:

```typescript
type MeerkatConfigVersions = Record<number, MeerkatModelConfig>;

const NIA_CONFIGS: MeerkatConfigVersions = {
  1: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.35, maxTokens: 400,
       speed: 0.91, minChars: 25, voiceModel: 'eleven_turbo_v2_5', sttModel: 'nova-3' },
  // v2 se agrega aquí cuando se experimente
};

export const MEERKAT_CONFIGS: Record<string, MeerkatConfigVersions> = {
  nia: NIA_CONFIGS, noah: NOAH_CONFIGS, nico: NICO_CONFIGS, nelia: NELIA_CONFIGS,
  nara: NARA_CONFIGS, naia: NAIA_CONFIGS, neo: NEO_CONFIGS, nova: NOVA_CONFIGS,
  nox: NOX_CONFIGS, niva: NIVA_CONFIGS,
};

// Regla dura documentada en el archivo:
// NUNCA editar una versión activa. Para cualquier cambio, agrega una nueva versión.
// NUNCA borrar una versión que exista como active_version en DB o como pinned en algún agente.
```

**`src/lib/vapi/resolve-meerkat.ts` (nuevo)** — resolver central con cache in-memory (60s TTL):

```typescript
export async function resolveMeerkatConfig(
  meerkatId: string,
  pinnedVersion: number | null,
): Promise<MeerkatModelConfig> {
  const versions = MEERKAT_CONFIGS[meerkatId];
  if (!versions) return DEFAULT_MODEL_CONFIG;

  // 1. Pin per-agent gana sobre active global
  if (pinnedVersion != null && versions[pinnedVersion]) return versions[pinnedVersion];

  // 2. Active version del meerkat (cached 60s)
  const active = await getActiveVersion(meerkatId);
  if (versions[active]) return versions[active];

  // 3. Fallback: última versión conocida en el bundle
  const latestKnown = Math.max(...Object.keys(versions).map(Number));
  logger.warn('stale active_version', { meerkatId, active, latestKnown });
  return versions[latestKnown];
}
```

**`sync.ts:407`** — una línea cambia de sincrona a await:

```typescript
// Antes:
const cfg: MeerkatModelConfig = (meerkatId ? MEERKAT_MODEL_CONFIG[meerkatId] : undefined) ?? DEFAULT_MODEL_CONFIG;
// Después:
const cfg = await resolveMeerkatConfig(meerkatId ?? '', agent.features.pinned_meerkat_version ?? null);
```

### Cache strategy

- `getActiveVersion(meerkatId)` cachea en memoria del proceso por 60s.
- Vercel es multi-instancia, así que cada instancia mantiene su propio cache.
- **MTTR floor de un rollback: 60s**. Durante esa ventana, tráfico mixto entre v_old y v_new.
- Aceptable para un rollback (la situación ya está degradada; propagación gradual no empeora).
- Si algún incidente futuro exige atomicidad, opciones: bajar TTL a 10s, query-per-call (Postgres <10ms), o usar Supabase Realtime channel para cross-instance invalidation.

## Data flow — los 3 escenarios operativos

### Flujo 1 — Publicar versión nueva (ej. Nia v3 con Opus 4.7)

1. Dev agrega `NIA_CONFIGS[3] = { model: 'claude-opus-4-7', ... }` en `meerkat-configs.ts`.
2. Commit + push + Vercel deploy. **v3 está disponible en el bundle pero no activa**. Todos los agentes Nia siguen sirviendo v2.
3. Nazre entra a `/admin/versiones`, ve "Nia — v3 disponible, no activada" y click "Activar v3".
4. Backend: transacción SQL con `INSERT meerkat_version_history` + `UPDATE meerkat_active_versions`.
5. Cache in-memory expira en ≤60s. Siguientes llamadas Nia usan v3.
6. Post-flip: job async de resync a Vapi para los agentes en modo native (ver E7 más abajo).

### Flujo 2 — Rollback (Nia v3 degrada llamadas)

1. Nazre detecta el problema (monitor diario, cliente reclama).
2. Entra a `/admin/versiones` → "Nia — activa v3 desde hace 2h" + historial.
3. Click "Rollback a v2".
4. Misma transacción: `INSERT history (from=3, to=2, reason='rollback')` + `UPDATE active_versions`.
5. Cache expira en ≤60s. v2 vuelve a servir. **Sin deploy, sin git revert.**

### Flujo 3 — Pin per-agent (proteger Palacio Municipal)

Camino A (antes del rollout global):
1. Nazre va a ficha del agente Palacio Monterrey → tab "Versión".
2. UI: "Meerkat: nia, versión efectiva: v2 (siguiendo latest global)".
3. Toggle "Fijar en versión específica" + dropdown [v1, v2, v3].
4. Selecciona v2 → `UPDATE features.pinned_meerkat_version = 2`.
5. Aunque Nazre active v3 globalmente, Palacio sigue en v2.

Camino B (después del rollback):
1. v3 sirve bien para 90% pero rompe para Palacio (edge case).
2. Pin Palacio en v2, luego reactivar v3 global. Todos menos Palacio usan v3.

### Invariantes

- `active_version` siempre debe apuntar a una versión que existe en `MEERKAT_CONFIGS`. CI check (Test 1 abajo) garantiza esto.
- `meerkat_version_history` es append-only. Nunca se borra. Responde "¿qué versión estaba activa el jueves a las 3pm?".
- Pin sin versión válida → resolver ignora el pin y usa active + log warning.
- **Nunca borrar versiones del código** sin antes migrar `active_version` y todos los `pinned_meerkat_version`.

## Portal admin UI

### Ruta 1: `/admin/versiones` (nueva)

Tabla — una fila por meerkat (10 filas totales):

```
Meerkat  | Activa | Última activación   | Agentes usando          | Versiones disponibles | Acciones
---------|--------|---------------------|-------------------------|-----------------------|------------------------
nia      | v2     | 2026-07-15 by nazre | 47 (44 latest, 3 pinned)| v1, v2, v3            | [Activar v3] [Historial]
noah     | v1     | 2026-06-01 by nazre | 8                       | v1                    | —
```

**Modal de confirmación al activar:**
```
Vas a activar Nia v3.
  Versión activa actual: v2 (desde 2026-07-15)
  Agentes que verán el cambio: 44 (no pinned)
  Agentes protegidos por pin: 3
  Diff resumido: model haiku-4.5 → opus-4.7, temperature 0.35 → 0.30
Motivo (opcional): [_______________]
[Cancelar] [Activar v3]
```

Toast tras confirmar: "Nia v3 activa. Puede tardar hasta 60s en propagarse."

**Drawer de historial** (click "Ver historial"): timeline por meerkat.

### Ruta 2: Tab "Versión" en ficha del agente

Sin pin:
```
Meerkat: nia
Versión efectiva: v2 (siguiendo latest global)

[ ] Fijar en versión específica  [Dropdown: v1, v2, v3]  [Guardar]
```

Con pin:
```
Meerkat: nia
Versión efectiva: v2 (PIN activo — no sigue rollouts globales)

[✓] Fijar en versión específica: [v2 ▾]  [Guardar]  [Quitar pin]

Cambios globales que este agente NO recibió:
  2026-07-30  Nia v2 → v3  (rollout global)
```

### APIs nuevas (todas admin-only para MVP)

- `GET  /api/admin/versiones` — lista meerkats con state (active, disponibles, agent counts).
- `POST /api/admin/versiones/:meerkat/activate` — body: `{ version: number, reason?: string }`.
- `GET  /api/admin/versiones/:meerkat/history` — timeline.
- `PATCH /api/portal/agents/:id/pin-version` — body: `{ pinned_version: number | null }` (null = quitar pin). Admin-only por ahora; el propio cliente puede tener acceso más adelante si se define UX.

### Sidebar admin

Nueva entrada "Versiones" en `/admin`. Icono `GitBranch` de Lucide.

### Fuera del alcance del MVP (parkeado explícitamente)

- Diff visual detallado entre versiones (más allá del resumen texto que dev escribe en `notes`).
- Preview/simulator del agente con otra versión (requiere golden tests suite — pilar 4).
- Aprobaciones multi-persona.
- Métricas por versión en el mismo panel (el monitor diario ya tiene esto).
- Auto-rollback basado en métricas.

## Migración desde el estado actual

**Cutover en un solo deploy con default = todos los meerkats en v1.**

### Paso 1 — SQL migration

`migrations/2026-07-30_meerkat_versioning.sql`: crea las 2 tablas y seed de las 10 filas iniciales (todos en v1 con `activated_by='system'`, `notes='baseline pre-versioning'`).

### Paso 2 — Refactor código en el mismo commit

- Mueve `MEERKAT_MODEL_CONFIG` de `sync.ts:355` a `src/lib/vapi/meerkat-configs.ts` como versión 1 de cada meerkat.
- Crea `src/lib/vapi/resolve-meerkat.ts` con `resolveMeerkatConfig()` + cache.
- `sync.ts:407` pasa a `await resolveMeerkatConfig(...)`.
- Type de `VoiceAgentFeatures`: añadir `pinned_meerkat_version?: number | null`.

### Paso 3 — Verificación pre-deploy (Test 1, crítico)

**Antes** de aplicar el refactor: correr `buildVapiAssistant(agent)` para un agente representativo por cada meerkat y guardar los JSON como snapshots (`__snapshots__/vapi-assistant-{meerkat}.json`).
**Después** del refactor: correr contra los mismos agentes y comparar con los snapshots. Byte-idéntico o falla el deploy.

### Paso 4 — Deploy

1. SQL migration en Supabase prod.
2. Vercel deploy.
3. Primera llamada Nia: resolver lee `active_version=1` → `NIA_CONFIGS[1]` → mismo output que antes. Sin regresión.

### Paso 5 — Post-deploy sanity

- Trigger de resync de todos los agentes activos vía `sync.ts` para forzar que Vapi reciba el objeto assistant desde el nuevo pipeline (debería ser idéntico byte-a-byte).
- Revisar `voice_calls` de las próximas 2 horas: outcomes normales, no error rate anómalo.

### Paso 6 — Portal UI

Se ship en el mismo deploy. Sin la UI el sistema ya funciona vía SQL manual, pero el compromiso es no dejar el pilar a medio construir.

### Riesgos de la migración y mitigación

| Riesgo | Mitigación |
|---|---|
| Refactor introduce bug sutil (features.pinned_meerkat_version undefined en agentes viejos) | El `??` handle el caso; Test 1 lo atrapa. |
| Migration corre pero deploy falla → tablas huérfanas | Migration es idempotente. No hay downside de tenerlas sin código. |
| Cache de Vapi retiene assistant viejo | Resync forzoso en Paso 5. |
| Alguien edita `MEERKAT_CONFIGS['nia'][1]` en el futuro pensando que es "la config actual" | Comentario prominente + CI check que compara diffs contra el commit inicial de cada versión. |

## Error handling y edge cases

**E1. Meerkat sin fila en `meerkat_active_versions`**
Resolver retorna `DEFAULT_MODEL_CONFIG`. Log warning. No falla la llamada.

**E2. `active_version` apunta a versión inexistente en código**
Fallback a `Math.max(versiones disponibles)`. Log warning. CI check en el pipeline de deploy detecta esto antes de que llegue a prod.

**E3. `pinned_meerkat_version` inválido en un agente**
Resolver ignora pin y sigue el camino normal. Log warning con agent_id.

**E4. Race: dos activate simultáneos**
Transacción con `SELECT ... FOR UPDATE` en `meerkat_active_versions` serializa. El segundo lee el nuevo state; server responde "ya estás en v3" sin history duplicado.

**E5. Cache stale post-flip en instancias distintas de Vercel**
Aceptado como MTTR floor de 60s. Documentado.

**E6. Agente cambia de `meerkat_role_id` con pin activo**
Al PATCH de `meerkat_role_id`, backend también hace `pinned_meerkat_version = null`. El pin es semánticamente per-meerkat.

**E7. Modo Vapi native vs custom-LLM**
En custom-LLM (`features.use_custom_llm=true`), el resolver corre en cada llamada — flip propaga en ≤60s.
En Vapi native, el assistant en Vapi tiene el modelo/prompt de la última sync — flip **no propaga** hasta el próximo sync. Por eso el botón "Activar" dispara un job async de resync a los agentes afectados. Toast: "v3 activa. Resync a 44 assistants en progreso (~2 min)."

**E8. Rollback durante llamada activa**
La llamada en curso termina con la versión que estaba activa al inicio. Vapi no re-lee config mid-call. Siguientes llamadas usan la nueva versión. Aceptable.

## Testing

**Test 1 — Snapshot test de migración (crítico, pre-deploy)**
Snapshot capturado antes del refactor con `buildVapiAssistant()` para un agente por cada meerkat. Test post-refactor compara contra ese snapshot; byte-idéntico o falla el deploy. Corre local y en CI.

**Test 2 — Resolver unit tests** (`resolve-meerkat.test.ts`)
- Sin pin, active=1 → `NIA_CONFIGS[1]`
- Sin pin, active=2 → `NIA_CONFIGS[2]`
- Pin=1, active=2 → `NIA_CONFIGS[1]` (pin gana)
- Pin=99 (inválido), active=2 → `NIA_CONFIGS[2]` + warning
- Meerkat desconocido → `DEFAULT_MODEL_CONFIG` + warning
- active=5 pero solo hay {1,2,3} → `NIA_CONFIGS[3]` + warning
- Cache: 2 llamadas consecutivas hacen 1 sola query

**Test 3 — API endpoint tests**
- `POST /activate` sin auth → 401
- `POST /activate` a versión inexistente → 400
- `POST /activate` a la versión ya activa → 200 no-op (sin history duplicado)
- `POST /activate` válido → transacción escribe history + active_version
- Race test: dos POST simultáneos, serialización correcta

**Test 4 — Integration test del flujo completo**
- Seed agente Nia active=1
- `buildVapiAssistant` → `NIA_CONFIGS[1]`
- POST activate v2, bypass cache
- `buildVapiAssistant` → `NIA_CONFIGS[2]`
- POST rollback a v1
- `buildVapiAssistant` → `NIA_CONFIGS[1]`
- Historial tiene 2 filas

**Test 5 — UI smoke (manual o Chrome DevTools MCP)**
- `/admin/versiones` carga las 10 filas
- Modal muestra diff, counts, pinned excluded
- Ficha de agente: pin toggle funcional
- Historial drawer renderiza timeline

**Test 6 — Post-deploy prod verification** (checklist manual)
- `SELECT * FROM meerkat_active_versions` → 10 filas, todos en v1
- 1 llamada de prueba a agente demo → outcome normal
- Monitor diario del día siguiente sin anomalías

**Fuera del alcance de tests para este MVP:**
- Golden tests de "prompt renderizado v2 no degrada score X% vs v1" — es pilar 4, viene después.
- Load test del resolver (cache in-memory + Postgres query trivial, no hay motivo).

## Estimación

- Backend (tablas, resolver, refactor sync.ts, APIs): ~4-5 días
- Portal admin UI (ruta admin + tab en ficha agente): ~4-5 días
- Testing + smoke + deploy + verificación: ~2 días
- **Total: ~2 semanas**

## Relación con el resto del framework de evolución

Este spec cubre el **pilar 1** completo (versionar). Los pilares 2-5 se apoyan encima:

- **Pilar 2 (contract-first):** independiente, ya se practica implícitamente.
- **Pilar 3 (feature flags con rollout gradual):** el `pinned_meerkat_version` es una forma primitiva. La versión completa (rollout por porcentaje con hash determinista) puede shippear como iteración 2 sobre este cimiento.
- **Pilar 4 (golden tests):** cuando existan, cada nueva versión de un meerkat debe pasar los golden tests antes de que "Activar" esté disponible en la UI. Hook natural en el modal de confirmación.
- **Pilar 5 (observabilidad segmentada):** dashboards que slicen por `meerkat_version` — habilitado por el campo `voice_calls.meerkat_version_used` (que se puede añadir en iteración 2, no en este MVP).

## Referencias

- `project_centinelia_evolution_framework.md` (memoria)
- `src/lib/vapi/sync.ts:340-378` (MEERKAT_MODEL_CONFIG actual)
- `src/lib/voice/prompt-builder.ts` (consumidor del meerkat config)
- Sesión 23 (`decisions_centinelia_session23.md`) — HCP + MEERKAT_MODEL_CONFIG original
- Spec hermano: `2026-07-29-opt-in-automations-design.md` — patrón de opt-in que informa el shape de pinning
