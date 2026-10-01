---
status: approved-for-planning
author: Nazre + Claude
date: 2026-10-01
scope: fase-1-of-3-nami-autonomy
supersedes: null
---

# Nami Fase 1 — Writers de inventario al Excel

## Contexto y goal

AC Proyectos (piloto Mes 1) mandó una PPT de 16 slides describiendo el flujo completo de inventario de equipos TRANE que Camila ejecuta hoy manualmente. Nami actualmente tiene 8 tools de READ (consulta por serie/modelo/cliente, stock snapshot, reposiciones por correo, llamar, buscar directorio, enviar correo). El PPT exige también capacidad de WRITE al Excel + parsers de PDFs TRANE + orquestación autónoma por eventos.

Esta spec cubre **Fase 1 de 3**: los 5 tools de escritura al Excel + 1 tabla de audit log + feature flag de rollout. Fases 2 (parsers TRANE PDF) y 3 (orquestación autónoma vía inbox-processor + QB + Solución Factible lookup) se especean después.

**Goal Fase 1**: Camila pide a Nami en el chat del portal "marca el equipo serie X como separado para cliente Y vendedor ANA" (y las 4 variantes equivalentes), Nami escribe al Excel real en SharePoint, Camila lo verifica abriendo el archivo, y la mutación queda auditada en `inventory_mutations_log` con before/after state para rollback trivial. Sin autonomía por eventos todavía.

**Success criteria** (medibles al final de Fase 1):
- Camila completa los 5 escenarios del test E2E (agregar equipo, cambiar estatus, asignar cliente, registrar venta, registrar salida multi-serie) desde el chat sin tocar Excel manualmente.
- 100% de las mutaciones generadas por Nami quedan en `inventory_mutations_log` con before_state_json y after_state_json populated.
- 0 corrupciones de datos reportadas por Camila en la primera semana post-rollout.
- Las 5 tools tienen regression tests que caen antes del fix de cualquier bug reportado (TDD por `[[feedback-close-gaps-before-testing]]`).

**Fuera de scope** (explícito, para Fases 2+3):
- Hoja de salida PDF generada (es papel pre-impreso; Nami solo captura el folio).
- Notificación al grupo cuando sale un equipo.
- Lookup Solución Factible por folio de factura venta (Fase 3).
- Backlog PDF parser (Fase 2).
- Factura TRANE PDF parser (Fase 2).
- Validaciones de transición de estatus (ALMACEN → SEPARADO → ENTREGADO como regla dura).
- Autonomía por eventos (inbox-processor dispara Nami).

## Decisiones de diseño clave

1. **Thin tool wrappers sobre adapter helpers** (enfoque A de brainstorm). Las 5 tools quedan ~30 líneas cada una en executor.ts. La lógica real vive en `src/lib/inventory/adapter.ts` como 5 funciones nuevas que se testean con GraphExcel mockeado.

2. **Patch-by-serie como patrón único**. Los 4 tools de patch (actualizar_estatus, asignar_cliente, registrar_venta, registrar_salida) comparten `findRowIndexBySerie(ctx, serie)` + `withSession → patchCell`. `inv_agregar_equipo` es la excepción porque usa `addTableRow`.

3. **Session batching para multi-serie**. `inv_registrar_salida` recibe N series y las patch en una sola sesión Excel. Minimiza costo + races con Tania editando en vivo.

4. **Idempotencia** vía check pre-write. `patchEstatusBySerie(serie, X)` si estatus actual == X retorna `{ok:true, no_op:true}` sin tocar Excel. Protege de doble-triggering agéntico.

5. **Refund policy**:
   - Errores infra (OAuth, Graph 403/429/5xx, config missing) → refund 1 op, no se cobra.
   - Errores negocio (serie no existe, dedup, validación input) → se cobran como consulta normal.
   Consistente con `[[feedback-pool-accuracy-top-priority]]`.

6. **Audit trail dedicado**. Nueva tabla `inventory_mutations_log` con before/after state JSON. Permite rollback de mutaciones por script sin re-ejecutar prompts. RLS enabled por default per `[[feedback-rls-public-tables-default]]`.

7. **Feature flag `features.inventory_write_enabled`** por agente (default false). Nami solo ve las writes en el prompt si el flag está true. Permite shippear código sin exposición hasta E2E con Camila.

8. **Bodega auto-asignada por tonelada** cuando no se pasa explícita: ≤5TR → FLETEROS, >5TR → CENIZO. Alias se resuelven con `bodegas_aliases` del config.

9. **costo_mx determinista** (no LLM math) — se calcula `usd * tc` en el adapter, nunca se le pide a Nami que multiplique por `[[CLAUDE.md regla 2 latent vs deterministic]]`.

10. **Columna FOLIO SALIDA nueva en Excel** — Camila la agrega una sola vez. Durante el gap entre code-shipped y column-added, `inv_registrar_salida` guarda el folio en metadata del `agent_run` como fallback y narra "guardado en bitácora, pendiente columna oficial en Excel".

## Arquitectura

### Capas

```
┌──────────────────────────────────────────────────────────────────┐
│ Portal UI (OpsAgentChatFab)                                       │
│   usuario escribe "marca serie X como separado para cliente Y"    │
└──────────────┬───────────────────────────────────────────────────┘
               │ POST /api/portal/[token]/agent-chat
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ agent-chat/route.ts                                               │
│   LLM decide invocar inv_asignar_cliente                          │
└──────────────┬───────────────────────────────────────────────────┘
               │ executeAgentTool('inv_asignar_cliente', ...)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ tools/executor.ts — handler delgado                               │
│   valida input, llama adapter helper, formatea mensaje            │
└──────────────┬───────────────────────────────────────────────────┘
               │ adapter.patchClienteBySerie(ctx, serie, data)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ inventory/adapter.ts — helpers de dominio (NUEVO)                 │
│   addEquipoRow, patchEstatusBySerie, patchClienteBySerie,         │
│   patchVentaBySerie, patchSalidaBySeries                          │
│   + helper interno movido findRowIndexBySerie                     │
└──────────────┬───────────────────────────────────────────────────┘
               │ GraphExcel.withSession + patchCell / addTableRow
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ inventory/graph-excel.ts — primitivas Graph (existe, sin cambios) │
└──────────────┬───────────────────────────────────────────────────┘
               │ fetch https://graph.microsoft.com/v1.0/...
               ▼
         Microsoft Graph API → SharePoint Excel INVENTARIO NAMI 2026.xlsx
```

Side-effect en cada write:
```
inventory_mutations_log  ← INSERT con before/after state JSON
agent_runs.tools_called  ← array append con name + ok + error (ya existe)
ai_ops_log               ← INSERT via consumeAiOp (ya existe)
```

### Capa por capa, qué cambia

- `graph-excel.ts` → **sin cambios**. Las primitivas `addTableRow`, `patchRange`, `patchCell`, `withSession` ya existen y están testeadas.
- `inventory/adapter.ts` → **crece de ~550 a ~1050 líneas**. 5 funciones write + mover `findRowIndexBySerie` desde executor.ts + helper interno `patchCellsInSession`.
- `tools/executor.ts` → **5 nuevos handlers**, cada ~30 líneas. Case `inv_agregar_equipo`, `inv_actualizar_estatus`, `inv_asignar_cliente`, `inv_registrar_venta`, `inv_registrar_salida`.
- `tools/registry.ts` → **5 nuevos tool schemas** (Anthropic.Tool shape).
- `tools/channel-mapping.ts` → **wire para 3 canales** (voice placeholder, chat, email) per `[[feedback-tool-3-canales]]`.
- `vapi/sync.ts` → **agregar los 5 a la distribución `nami`** del MEERKAT_VOICE_DISTRIBUTION.
- `supabase/migrations/<ts>_inventory_mutations_log.sql` → **nueva tabla + RLS**.
- `_smoke/inv-write-dryrun-ac.mjs` → **smoke script** que escribe-y-revierte en Supabase prod + Graph real, con `assertNotProdOrAllowed` default-guard.
- `src/lib/inventory/__tests__/adapter-writers.test.ts` → **~25 unit tests** mockeando GraphExcel.
- `src/lib/tools/executor.ts` sin `__tests__` nuevo si ya existen tests del executor que cubren el patrón; si no, se agregan ~15 tests para los handlers.

## Los 5 tools

### 1. `inv_agregar_equipo`

**Cuándo lo usa Nami**: cuando un equipo físico llega al almacén y Camila le dice "me llegó un 4TXK6560G1000AA, serie 2619HA012345, 5 toneladas" (paso 8 del PPT).

**Input schema**:
```typescript
{
  oc:            string;              // required — folio OC en QB
  modelo:        string;              // required
  serie:         string;              // required — del label físico; CRÍTICO no inventar
  bodega?:       string;              // optional — autocalcula de tonelada si falta
  tonelada?:     number;              // optional — toneladas del equipo
  descripcion?:  string;              // optional
  ref?:          string;              // optional — refrigerante (R410A, etc.)
  seer?:         string;              // optional
  volts?:        string;              // optional
  usd?:          number;              // optional — costo USD de factura TRANE
  tc?:           number;              // optional — tipo de cambio
  fecha_compra?: string;              // optional — YYYY-MM-DD, default hoy
  folio_factura?: string;             // optional — folio factura compra TRANE
  fecha_factura?: string;             // optional
}
```

**Comportamiento**:
- Rechaza con `serie_already_exists` si la serie ya existe en Tabla6 (lookup previo con `findRowIndexBySerie`).
- Si `tonelada` presente y `bodega` ausente: `bodega = tonelada <= 5 ? 'FLETEROS' : 'CENIZO'`.
- Si `usd` y `tc` presentes: `costo_mx = Math.round(usd * tc * 100) / 100` (deterministic, 2 decimales).
- `estatus` arranca en `'ALMACEN'`.
- Llama `GraphExcel.addTableRow` con el array ordenado según el header de Tabla6 (lee header via `getTableHeader` en la misma sesión).

**Retorno**:
```typescript
{
  ok: true,
  serie,
  bodega_asignada: 'FLETEROS',
  row_index: 42,
  message: 'Agregado equipo serie 2619HA012345 a bodega FLETEROS en row 42.'
}
```

### 2. `inv_actualizar_estatus`

**Cuándo**: cambios de estado operativos (paso 10 del PPT). Caso más frecuente: `ALMACEN → SEPARADO` cuando cliente paga, luego `SEPARADO → ENTREGADO` al salir del almacén.

**Input schema**:
```typescript
{
  serie:         string;                       // required
  nuevo_estatus: 'ALMACEN' | 'SEPARADO' | 'ENTREGADO' | 'PENDIENTE' | 'PEDIDO' | 'DEVUELTO' | 'DESHABILITADO';
  notas?:        string;                       // optional — razón del cambio, va a bitácora
}
```

**Comportamiento**:
- `findRowIndexBySerie(serie)` → si no existe, `{ok:false, code:'serie_not_found'}`.
- Lee estatus actual del `row` retornado por findRowIndex. Si `estatus_actual === nuevo_estatus` → `{ok:true, no_op:true}`.
- Patch 1 celda (columna `ESTATUS` del `columns_historico`).
- NO valida transiciones (PPT no impone orden duro — `ALMACEN → DEVUELTO` es legal).
- Si `notas` presente, se guarda en `inventory_mutations_log.notes` (no en Excel).

**Retorno**:
```typescript
{
  ok: true,
  serie,
  estatus_anterior: 'ALMACEN',
  estatus_nuevo: 'SEPARADO',
  message: 'Serie 2619HA012345: ALMACEN → SEPARADO.'
}
```

### 3. `inv_asignar_cliente`

**Cuándo**: ventas confirma que un cliente pagó (paso 11-12 del PPT). Side-effect opcional: marca el equipo como SEPARADO.

**Input schema**:
```typescript
{
  serie:            string;    // required
  cliente_nombre:   string;    // required
  vendedor_codigo?: string;    // optional — codes conocidos: ANA, ANG, MTP, RLP; o libre
  marcar_separado?: boolean;   // default true — side-effect patch estatus
  force?:           boolean;   // default false — override cliente ya asignado
}
```

**Comportamiento**:
- `findRowIndexBySerie(serie)`.
- Lee `cliente` actual de la fila. Si existe y `force !== true` → `{ok:false, code:'cliente_assigned_conflict', current_cliente}`.
- Patch `cliente` + `vendedor` (si pasó) en una sesión.
- Si `marcar_separado === true` y `estatus_actual === 'ALMACEN'`, patch `estatus → SEPARADO` también (misma sesión).

**Retorno**:
```typescript
{
  ok: true,
  serie,
  cliente_asignado: 'Mauricio Guerra',
  vendedor: 'ANA',
  estatus_resultante: 'SEPARADO',
  message: 'Serie 2619HA012345 asignada a Mauricio Guerra (vendedor ANA), marcada SEPARADA.'
}
```

### 4. `inv_registrar_venta`

**Cuándo**: cierre de ciclo. Camila recibe folio de factura venta (ventas le manda por correo) y precio (hoy manual lookup en Solución Factible; Fase 3 automatiza).

**Input schema**:
```typescript
{
  serie:               string;   // required
  folio_venta:         string;   // required
  fecha_venta:         string;   // required YYYY-MM-DD
  factura_venta?:      string;   // optional — serie/folio alternativo si distinto
  precio_unitario_mx:  number;   // required
  factor?:             number;   // optional — si falta, se calcula precio / costo_mx
}
```

**Comportamiento**:
- `findRowIndexBySerie(serie)`.
- Lee `costo_mx` actual de la fila. Si vacío Y `factor` no provisto → `{ok:false, code:'cannot_compute_factor'}` (no inventamos).
- Si `factor` provisto por el user, se respeta. Si no: `factor = Math.round(precio_unitario_mx / costo_mx * 10000) / 10000` (4 decimales).
- Patch 4 celdas: `folio_venta`, `fecha_venta`, `factura_venta` (si pasó), `costo_venta_mx` o `precio_unitario_mx` (depende del mapping actual del AC Excel — a confirmar leyendo header real pre-rollout).
- NO cambia estatus — asumimos ENTREGADO ya via `inv_registrar_salida`.

**Retorno**:
```typescript
{
  ok: true,
  serie,
  folio_venta,
  precio_unitario_mx,
  factor_calculado: 1.3542,
  message: 'Venta registrada serie 2619HA012345: folio ABC-123, precio $25,000 MXN, factor 1.3542.'
}
```

### 5. `inv_registrar_salida`

**Cuándo**: equipos salen del almacén con la hoja de salida física (taco pre-impreso con folio en rojo, cliente firma al recibir). Camila captura folio + series + cliente al chat de Nami.

**Input schema**:
```typescript
{
  folio_hoja:      string;    // required — del taco pre-impreso (ej. '4251')
  cliente_nombre:  string;    // required
  vendedor_codigo?: string;   // optional
  fecha?:          string;    // optional YYYY-MM-DD, default hoy
  series:          string[];  // required, min 1 — equipos que salen juntos
  proyecto?:       string;    // optional
}
```

**Comportamiento**:
- 1 sesión compartida para N series.
- Por cada serie:
  - `findRowIndexBySerie(serie)` → si no existe, acumula en `series_not_found`, continúa con las demás.
  - Patch: `estatus = ENTREGADO`.
  - Patch cliente si no estaba (si estaba y ≠ `cliente_nombre`, acumula warning en `conflicts`).
  - Patch fecha de venta tentativa = `fecha` (del folio hoja; se puede sobre-escribir después con `inv_registrar_venta` cuando llegue el folio factura real).
  - Si la columna `FOLIO SALIDA` existe en header → patch con `folio_hoja`. Si NO existe → guardar en `inventory_mutations_log.metadata.folio_hoja`.
- Series que no se encuentran se reportan en el retorno (no abortan las que sí funcionaron).

**Retorno**:
```typescript
{
  ok: true,
  folio_hoja: '4251',
  series_registradas: ['2616HA045921', '2617HA02401A'],
  series_not_found: [],
  conflicts: [],
  message: 'Hoja de salida 4251 registrada: 2 equipos entregados a Mauricio Guerra.'
}
```

## Error table

| category                  | code                        | ops | user message |
|---------------------------|-----------------------------|-----|------|
| Config missing            | `not_configured`            | refund | "Configura el Excel en portal → Nami → Inventario" |
| OAuth storage missing     | `microsoft_disconnected`    | refund | "Conecta OneDrive en portal → Nami → Almacenamiento" |
| Token refresh fail        | `refresh_failed`            | refund | "La conexión de OneDrive expiró; reconéctala en el portal" |
| Serie no encontrada       | `serie_not_found`           | keep | "No encontré el equipo con serie X" |
| Dedup estado actual       | `no_op`                     | keep | "Ya estaba en estatus X, no toqué nada" |
| Validación input          | `invalid_input`             | refund | "Falta <campo>: <razón>" |
| Serie duplicada (agregar) | `serie_already_exists`      | keep | "La serie X ya está registrada en row N" |
| Cliente conflict          | `cliente_assigned_conflict` | keep | "La serie X ya está asignada a Y; usa force=true si quieres reemplazar" |
| Factor sin costo_mx       | `cannot_compute_factor`     | keep | "No hay costo_mx en la fila; pásame factor explícito o completa costo primero" |
| Graph 429                 | `graph_rate_limited`        | refund | retry 1x con backoff; si falla, reportar |
| Graph 5xx                 | `graph_server_error`        | refund | retry 1x; si falla, incident a Nash |
| Graph 403                 | `graph_permission_denied`   | refund | "El token no tiene permisos; reconecta OneDrive con permisos de archivos" |
| Graph 404 (itemId stale)  | `graph_item_not_found`      | refund | "El archivo Excel ya no existe en SharePoint; re-vincula" |

## Audit trail — `inventory_mutations_log`

### Schema

```sql
CREATE TABLE inventory_mutations_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email       text NOT NULL,
  agent_id           uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  tool_name          text NOT NULL,
  serie              text,                       -- NULL si tool fue multi-serie o add_equipo
  table_row_index    int,                        -- NULL si add_equipo (nueva fila)
  before_state       jsonb,                      -- row completa antes del patch (null si add)
  after_state        jsonb NOT NULL,             -- row completa después
  patched_columns    text[],                     -- qué columnas tocó
  metadata           jsonb,                      -- folio_hoja, notas, warnings
  ops_charged        int NOT NULL DEFAULT 0,     -- cuántas ops cobró este write
  success            boolean NOT NULL,
  error_code         text,                       -- si success=false
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX inv_mutations_log_portal_idx ON inventory_mutations_log (portal_email, created_at DESC);
CREATE INDEX inv_mutations_log_serie_idx  ON inventory_mutations_log (serie) WHERE serie IS NOT NULL;
CREATE INDEX inv_mutations_log_agent_idx  ON inventory_mutations_log (agent_id);

ALTER TABLE inventory_mutations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_mutations_service_role_all ON inventory_mutations_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Portal UI puede leer con una policy adicional en Fase 2 cuando se construya la vista "actividad de Nami en el inventario".

### Rollback script

`_smoke/revert-inv-mutation.mjs <mutation_id>`:
1. Lee row por id.
2. Si `before_state` null (add_equipo) → DELETE row del Excel por table_row_index.
3. Si no → patchRange con `before_state`, columna por columna de `patched_columns`.
4. Inserta nueva row `inventory_mutations_log` con tool_name='manual_revert' + metadata.reverted_id.

## Testing

### Pirámide

```
Layer                          | Count  | Scope
-------------------------------+--------+---------------------------------------------
Unit — adapter helpers         | ~25    | Mock GraphExcel. Cubre: cálculo bodega,
                               |        | costo_mx det, no_op idempotency, conflict
                               |        | detection, multi-serie batching, ignore case
Unit — tool handlers           | ~15    | Mock adapter. Cubre: input validation,
                               |        | error → user message, ops refund dispatch
Contract — GraphExcel wrappers | ~5     | Fetch mock, snapshot req body. Nuevo:
                               |        | addTableRow happy path + 403/429 handling
Smoke integration              | 2      | AC real (manual, con permiso explícito):
                               |        | 1. _smoke/inv-write-dryrun-ac.mjs
                               |        |    patch celda scratch + revierte
                               |        |    assertNotProdOrAllowed guard
                               |        | 2. e2e desde chat con Camila en Meet
```

### TDD por regla CLAUDE.md

Cada bug fix en Fase 1 trae test que falla antes y pasa después. Features arrancan con test antes de código. Cobertura mínima para merge: 85% en adapter helpers nuevos y 70% en handlers.

### Evals

No aplica fuerte en Fase 1 (writes son determinísticos). Entra en Fase 2 (parsers) + 3 (orquestación). Dejamos goldens pequeños aquí solo para formato de mensajes narrables (fechas ISO, no "hace 2 días").

## Rollout plan

```
Semana | Qué se habilita                                         | Gate
-------+---------------------------------------------------------+---------------------
0 (hoy)| Spec aprobada + commit                                  | Nazre revisa este doc
1 d1   | PR: 5 adapter helpers + unit tests                      | CI verde, tsc, lint
1 d2   | PR: 5 tool handlers + schemas + registry                | CI verde
1 d3   | PR: migration inventory_mutations_log + RLS             | migra en prod + verifica RLS
1 d4   | PR: wire al pack inventory_excel + sync.ts + mapping    | flag OFF por default
1 d5   | Smoke dry-run en Supabase prod (write + revert)         | manual, con OK de Nazre
1 d6   | Camila opt-in: flag inventory_write_enabled = true      | mensaje consolidado
       | + ask: columna FOLIO SALIDA + confirmar headers         | ella responde o pregunta
1 d7   | E2E Camila: mueve 1 equipo real a través del ciclo     | Meet con Camila + Nazre
       | ALMACEN → SEPARADO → ENTREGADO + registra_salida        | validación en vivo
```

### Feature flag

Campo nuevo `voice_agents.features.inventory_write_enabled: boolean`. Default `false`.

En `tools/executor.ts` dentro del guard de inv_tools, agregar:
```typescript
if (toolName.startsWith('inv_') && WRITE_TOOLS.has(toolName)) {
  const flag = (agent.features as any)?.inventory_write_enabled === true;
  if (!flag) return { ok: false, error: 'Write disabled para este agente.', code: 'write_not_enabled' };
}
```

Y en el system prompt builder, filtrar los 5 tools de la lista expuesta a Nami si flag=false.

### Rollback plan

- Flag flip = cambio en 1 row voice_agents. Sin deploy.
- Write que corrompe Excel: `_smoke/revert-inv-mutation.mjs <id>` restaura con before_state_json.
- Bug sistémico: deshabilitar flag + descartar tool handlers del registry en PR revert.

## Dependencies externas y pre-requisitos

- **Camila agrega columna FOLIO SALIDA al Excel** antes del día 7 (o Nami cae al fallback de metadata). Se le pide en el mensaje consolidado d6.
- **Camila confirma header real de Tabla6** para validar los mapeos de `columns_historico` (ej. ¿es "COSTO VTA (MX)" o "PRECIO VENTA" la columna de la venta final?).
- **OAuth storage_microsoft** ya conectado (verificado 2026-10-01, token tiene scope `Files.ReadWrite`).
- **Config inventory_excel_config.location** ya resuelto (verificado 2026-10-01 vía `_smoke/configure-ac-inventory.mjs`, itemId=`0173LV3YNJ63W7X6M3ERFY7GY7CIRS7623`, siteId=`5b84e28e-20e4-404c-adc5-21911cd5b02e`).

## Open questions (resolver antes de spec → plan)

- (resueltas en brainstorm, incluidas por completeness)
- ~~Nami sola o compañero~~ → sola, delega a Nala solo si cae en emisión de CFDI real.
- ~~Decomposition de los 16 pasos~~ → 3 sub-specs por fase.
- ~~Hoja de salida formato~~ → papel pre-impreso, Nami captura folio.
- ~~Pedirle a Camila agregar columna ahora~~ → no, batched con mensaje consolidado d6.

Ninguna open question bloqueante para pasar a writing-plans.
