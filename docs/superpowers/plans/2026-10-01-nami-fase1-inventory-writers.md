# Nami Fase 1 — Inventory Writers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shippear 5 tools de escritura al Excel de inventario de AC Proyectos, con feature flag per-agente, audit log con rollback por script, y rollout gated 7 días hasta E2E con Camila.

**Architecture:** Thin tool handlers en `executor.ts` → adapter helpers en `src/lib/inventory/adapter.ts` → primitivas existentes en `graph-excel.ts`. Cada mutación se audita en nueva tabla `inventory_mutations_log` con before/after state JSON para rollback trivial. Flag `features.inventory_write_enabled` oculta las writes del prompt y bloquea su ejecución mientras `false`.

**Tech Stack:** TypeScript, Next.js 16, Supabase (Postgres + RLS), Microsoft Graph API (Excel workbook endpoints), Anthropic SDK (tool schemas), vitest (unit + smoke tests).

**Spec:** [docs/superpowers/specs/2026-10-01-nami-fase1-inventory-writers-design.md](../specs/2026-10-01-nami-fase1-inventory-writers-design.md)

## Global Constraints

- **TDD obligatorio** per `CLAUDE.md regla 5`: cada bug fix trae test que falla antes y pasa después.
- **Latent vs deterministic** per `CLAUDE.md regla 2`: cálculos (`costo_mx = usd * tc`, `factor = precio / costo_mx`) viven en código, nunca en el prompt de Nami.
- **RLS enabled by default** per `feedback-rls-public-tables-default`: toda tabla nueva en `public` schema requiere `ENABLE ROW LEVEL SECURITY` + política explícita en la misma migración.
- **Pool accuracy top priority** per `feedback-pool-accuracy-top-priority`: errores infra → `refundOps(agentId, 1, ...)`. Errores de negocio → se cobran.
- **Smoke guard prod DB** per `feedback-smoke-guard-prod-db`: todo smoke test que escribe a Supabase prod debe llamar `assertNotProdOrAllowed()` en `beforeAll` desde `@/lib/test-helpers/prod-guard`.
- **Full Spanish characters** per `feedback-espanol-completo`: strings user-facing usan ñ/á/é/í/ó/ú/¿/¡ (nunca ASCII plano).
- **No em-dashes** per `feedback-no-em-dash`: ni en código, ni en strings, ni en commit messages.
- **No PowerShell para bulk-edits** per `feedback-powershell-51-utf8-bulk-edit`: usar Node/sed/Python.
- **Anthropic logging** per `feedback-anthropic-debe-loggearse`: toda llamada LLM debe pasar por `logLlmCall`. (No aplica a este plan — writers no llaman LLM.)
- **Tool 3 canales** per `feedback-tool-3-canales`: cada tool se declara en voice, chat y email channels (incluso si voice está disabled para el role, se pone placeholder).
- **Nami jornada = tareas** (sin voz hoy): el wire a `sync.ts` voice distribution es por completitud; voice no se activará en Fase 1.
- **Pack feature flag** per `feedback-tool-bloat-reglas`: las writes solo aparecen si `features.inventory_write_enabled === true` AND el pack `inventory_excel` está activo.

## Review Focus

Inputs that the spec implies but no task's tests explicitly cover; each line has a test added to the owning task below.

1. **Serie con case/whitespace variantes** — Camila escribe "serie 2619ha012345 " con espacios y minúsculas; `findRowIndexBySerie` debe normalizar (`.trim().toUpperCase()`) antes de comparar. [Task 2 cubre.]
2. **Multi-tenant isolation** — un `resolveInventoryContext` con portal_email X nunca debe encontrar series del portal_email Y. [Task 3 cubre — test lee org diferente.]
3. **Race con Tania editando** — pre-state cambió entre findRowIndex y patchCell; el audit log debe guardar lo que REALMENTE escribió (post-write read), no lo que asumió. [Task 4 cubre — test con mock que cambia state entre lecturas.]
4. **Fechas en formato libre** — user manda "1 de octubre" o "oct 1 2026" en vez de ISO. Los handlers deben validar formato ISO estricto y rechazar con `invalid_input` + guía ("usa YYYY-MM-DD"). [Task 10 cubre — inv_actualizar_estatus no tiene fecha, pero Tasks 12-13 sí.]
5. **Serie con caracteres especiales** — serie "2619HA/02401A" con `/`, Graph API path puede romper si no se URL-encode. `findRowIndexBySerie` usa listTableRows (no construye path con serie), pero si futuro código construye path, debe `encodeURIComponent`. [Task 2 cubre — test con serie que contiene `/` y `+`.]

---

## Task 1: Migration `inventory_mutations_log` + RLS

**Files:**
- Create: `supabase/migrations/20261001010000_inventory_mutations_log.sql`
- Test: ejecutar `node scripts/supabase/test-rls.mjs inventory_mutations_log` tras aplicar

**Interfaces:**
- Produces: tabla `inventory_mutations_log` con columnas documentadas en spec sección "Audit trail"; consumida por Tasks 9-13 (handlers insertan rows) y Task 15 (rollback script lee rows).

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/20261001010000_inventory_mutations_log.sql`:

```sql
-- Audit log de mutaciones al Excel de inventario (AC Proyectos piloto Mes 1
-- y futuras orgs con pack inventory_excel). Permite rollback por script sin
-- re-ejecutar prompts, y vista "actividad de Nami" en el portal futura.
--
-- Precedente: spec docs/superpowers/specs/2026-10-01-nami-fase1-inventory-writers-design.md

CREATE TABLE inventory_mutations_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email       text NOT NULL,
  agent_id           uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  tool_name          text NOT NULL,
  serie              text,
  table_row_index    int,
  before_state       jsonb,
  after_state        jsonb NOT NULL,
  patched_columns    text[],
  metadata           jsonb,
  ops_charged        int NOT NULL DEFAULT 0,
  success            boolean NOT NULL,
  error_code         text,
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX inv_mutations_log_portal_idx ON inventory_mutations_log (portal_email, created_at DESC);
CREATE INDEX inv_mutations_log_serie_idx  ON inventory_mutations_log (serie) WHERE serie IS NOT NULL;
CREATE INDEX inv_mutations_log_agent_idx  ON inventory_mutations_log (agent_id);

ALTER TABLE inventory_mutations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_mutations_service_role_all ON inventory_mutations_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply migration locally**

Run: `cd centinelia && supabase db reset` (o `supabase migration up` si no quieres full reset).
Expected: migration aplicada sin error. Verifica con `supabase db diff` que no haya drift.

- [ ] **Step 3: Verify RLS enforcement**

Run inline test (one-shot script):
```bash
node -e "
const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
// Anon client should NOT see rows
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
anon.from('inventory_mutations_log').select('*').limit(1).then(r => console.log('ANON:', r.error?.code ?? 'LEAK — RLS roto!'));
// Service role should
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
svc.from('inventory_mutations_log').select('*').limit(1).then(r => console.log('SVC:', r.error ?? 'OK'));
"
```
Expected: ANON retorna error (RLS deniega), SVC retorna OK.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261001010000_inventory_mutations_log.sql
git commit -m "feat(inventory): tabla inventory_mutations_log con audit before/after state"
```

---

## Task 2: Mover `findRowIndexBySerie` a adapter

**Files:**
- Modify: `src/lib/inventory/adapter.ts` (agregar export)
- Modify: `src/lib/tools/executor.ts:5460-5472` (usar import del adapter en vez de definición inline)
- Test: `src/lib/inventory/__tests__/adapter-find-row.test.ts` (nuevo)

**Interfaces:**
- Produces: `findRowIndexBySerie(ctx: InventoryContext, serie: string): Promise<{tableRowIndex: number; row: unknown[]; headersMap: Record<string, number>} | null>`. Consumida por Tasks 4-7 (patch helpers) y Task 2's own executor.ts refactor.

- [ ] **Step 1: Read current inline impl**

Lee `src/lib/tools/executor.ts:5460-5472` para copiar la lógica exacta. Debe hacer:
1. `GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table)` + `GraphExcel.getTableHeader(...)` en paralelo
2. Localizar índice de columna SERIE en el header (del `columns_historico.serie` del config)
3. Normalizar serie input: `.trim().toUpperCase()`
4. Buscar primera row donde `String(row[serieColIdx]).trim().toUpperCase() === normalized`
5. Retornar `{tableRowIndex, row, headersMap}` o `null`

- [ ] **Step 2: Write failing tests**

Create `src/lib/inventory/__tests__/adapter-find-row.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../graph-excel', () => ({
  listTableRows: vi.fn(),
  getTableHeader: vi.fn(),
}));

const BASE_CTX = {
  portalEmail: 'camila@acproyectos.com',
  token: 'fake-token',
  config: {
    location: { scope: { type: 'me' as const }, itemId: 'ITEM-1' },
    sheets: { historico: { name: 'INVENTARIO', table: 'Tabla6' },
              stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
    columns_historico: { serie: 'SERIE', modelo: 'MODELO', estatus: 'ESTATUS' },
    estatus_validos: ['ALMACEN'],
    bodegas_canonicas: ['FLETEROS'],
  },
};

async function setupMock(headers: string[], rows: unknown[][]) {
  const gx = await import('../graph-excel');
  (gx.getTableHeader as any).mockResolvedValue(headers);
  (gx.listTableRows as any).mockResolvedValue(rows.map((r, i) => ({ index: i, values: r })));
}

describe('findRowIndexBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('encuentra fila por serie match exacto', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE', 'MODELO'], [['2619HA012345', '4TXK']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('normaliza case y whitespace del input (Review Focus #1)', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE', 'MODELO'], [['2619HA012345', '4TXK']]);
    const result = await findRowIndexBySerie(BASE_CTX, '  2619ha012345  ');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('normaliza case y whitespace de la celda del Excel', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE', 'MODELO'], [['  2619ha012345  ', '4TXK']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('serie con / y + (Review Focus #5) match literal', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE'], [['2619/HA+01A'], ['OTRA']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619/HA+01A');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('retorna null si no existe', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE'], [['OTRA']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result).toBeNull();
  });

  it('retorna headersMap con índice correcto por nombre', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['OC', 'MODELO', 'SERIE', 'ESTATUS'], [['A1', '4TXK', '2619HA012345', 'ALMACEN']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result?.headersMap).toEqual({ OC: 0, MODELO: 1, SERIE: 2, ESTATUS: 3 });
  });
});
```

- [ ] **Step 3: Run tests, verify fail**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-find-row.test.ts`
Expected: FAIL con "findRowIndexBySerie is not exported from '../adapter'".

- [ ] **Step 4: Move impl from executor.ts to adapter.ts**

En `src/lib/inventory/adapter.ts`, agregar antes de `listHistorico`:

```typescript
export interface RowIndexHit {
  tableRowIndex: number;
  row:           unknown[];
  headersMap:    Record<string, number>;
}

export async function findRowIndexBySerie(
  ctx: InventoryContext,
  serie: string,
): Promise<RowIndexHit | null> {
  const [headers, rows] = await Promise.all([
    GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table),
    GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table),
  ]);

  const headersMap: Record<string, number> = {};
  headers.forEach((h, i) => { headersMap[String(h).trim().toUpperCase()] = i; });

  const serieColumn = ctx.config.columns_historico.serie;
  const serieColIdx = headersMap[serieColumn.toUpperCase()];
  if (serieColIdx == null) return null;

  const needle = serie.trim().toUpperCase();
  for (const r of rows) {
    const cell = String((r.values as unknown[])[serieColIdx] ?? '').trim().toUpperCase();
    if (cell === needle) {
      return { tableRowIndex: r.index, row: r.values as unknown[], headersMap };
    }
  }
  return null;
}
```

- [ ] **Step 5: Refactor executor.ts to use import**

En `src/lib/tools/executor.ts:5456`, actualizar el import existente:

```typescript
const { resolveInventoryContext, listHistorico, findBySerie, findByModelo, readStock, computeReposiciones, normalizeBodega, GraphExcel, findRowIndexBySerie } = await import('@/lib/inventory/adapter');
```

Reemplaza la definición inline en `src/lib/tools/executor.ts:5460-5472` (la función `findRowIndexBySerie` ya definida) por nada — se usa el import.

- [ ] **Step 6: Run tests, verify pass**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-find-row.test.ts`
Expected: PASS 6/6.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: 0.

Run: `npx vitest run src/lib/inventory` (full inventory suite — regresión)
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add src/lib/inventory/adapter.ts src/lib/inventory/__tests__/adapter-find-row.test.ts src/lib/tools/executor.ts
git commit -m "refactor(inventory): mover findRowIndexBySerie a adapter + 6 tests

Prereq para los 4 patch helpers de Fase 1 (patchEstatusBySerie,
patchClienteBySerie, patchVentaBySerie, patchSalidaBySeries) que
comparten locate-by-serie como primer paso. Cubre normalización de
case/whitespace (Review Focus #1) y caracteres especiales (#5)."
```

---

## Task 3: Adapter helper `addEquipoRow`

**Files:**
- Modify: `src/lib/inventory/adapter.ts` (agregar función + helper interno `assignBodegaByTonelada`)
- Modify: `src/lib/inventory/__tests__/adapter-writers.test.ts` (nuevo archivo)

**Interfaces:**
- Consumes: `findRowIndexBySerie` (de Task 2) para dedup check.
- Produces: `addEquipoRow(ctx, input): Promise<{ok: true, serie, bodega_asignada, row_index, after_state} | {ok: false, code: 'serie_already_exists', existing_row_index} | ...>`. Consumida por Task 9 (handler).

- [ ] **Step 1: Write failing tests**

Create `src/lib/inventory/__tests__/adapter-writers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../graph-excel', () => ({
  listTableRows:  vi.fn(),
  getTableHeader: vi.fn(),
  addTableRow:    vi.fn(),
  withSession:    vi.fn(async (_token, _loc, fn) => fn({ id: 'session-1', persist: true, location: null })),
  patchCell:      vi.fn(),
  patchRange:     vi.fn(),
}));

const CTX = {
  portalEmail: 'camila@acproyectos.com',
  token: 't',
  config: {
    location: { scope: { type: 'me' as const }, itemId: 'ITEM-1' },
    sheets: { historico: { name: 'INVENTARIO', table: 'Tabla6' },
              stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
    columns_historico: {
      oc: 'OC', modelo: 'MODELO', serie: 'SERIE', estatus: 'ESTATUS',
      bodega: 'BODEGA', vendedor: 'VEND', cliente: 'CLIENTE',
      folio_venta: 'FOLIO', fecha_venta: 'FECHA DE VENTA',
      factura_venta: 'FACTURA', costo_venta_mx: 'COSTO VTA (MX)',
      tonelada: 'TON', usd: 'USD', tc: 'TC', costo_mx: 'COSTO MX',
      fecha_compra: 'FECHA COMPRA', folio_factura: 'FOLIO FACT', fecha_factura: 'FECHA FACT',
      descripcion: 'DESC', ref: 'REF', seer: 'SEER', volts: 'VOLTS',
    },
    estatus_validos:   ['ALMACEN', 'SEPARADO', 'ENTREGADO'],
    bodegas_canonicas: ['FLETEROS', 'CENIZO'],
  },
};

const HEADERS = ['OC','MODELO','SERIE','ESTATUS','BODEGA','TON','USD','TC','COSTO MX','FECHA COMPRA','FOLIO FACT','FECHA FACT','DESC','REF','SEER','VOLTS','VEND','CLIENTE','FOLIO','FECHA DE VENTA','FACTURA','COSTO VTA (MX)'];

async function mockHeaders(rows: unknown[][] = []) {
  const gx = await import('../graph-excel');
  (gx.getTableHeader as any).mockResolvedValue(HEADERS);
  (gx.listTableRows as any).mockResolvedValue(rows.map((r, i) => ({ index: i, values: r })));
}

describe('addEquipoRow', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('agrega equipo con tonelada ≤ 5 → bodega FLETEROS', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodega_asignada).toBe('FLETEROS');
  });

  it('tonelada > 5 → bodega CENIZO', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodega_asignada).toBe('CENIZO');
  });

  it('respeta bodega explícita sobre tonelada', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 10, bodega: 'FLETEROS' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodega_asignada).toBe('FLETEROS');
  });

  it('calcula costo_mx = usd * tc (deterministic, 2 decimales)', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    let capturedRow: unknown[] = [];
    (gx.addTableRow as any).mockImplementation((_t: unknown, _l: unknown, _tbl: unknown, values: unknown[]) => {
      capturedRow = values;
      return Promise.resolve({ index: 10 });
    });
    await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 3, usd: 1500, tc: 17.3421 });
    const costoMxIdx = HEADERS.indexOf('COSTO MX');
    expect(capturedRow[costoMxIdx]).toBe(26013.15);
  });

  it('rechaza si serie ya existe (serie_already_exists)', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN']]);
    const r = await addEquipoRow(CTX, { oc: 'A2', modelo: '4TXK', serie: '2619HA012345' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('serie_already_exists');
      expect(r.existing_row_index).toBe(0);
    }
  });

  it('estatus arranca en ALMACEN', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    let capturedRow: unknown[] = [];
    (gx.addTableRow as any).mockImplementation((_t: unknown, _l: unknown, _tbl: unknown, values: unknown[]) => {
      capturedRow = values;
      return Promise.resolve({ index: 10 });
    });
    await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345' });
    const estatusIdx = HEADERS.indexOf('ESTATUS');
    expect(capturedRow[estatusIdx]).toBe('ALMACEN');
  });

  it('after_state contiene el row completo que se insertó (Review Focus #2 multi-tenant)', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.after_state).toHaveProperty('OC', 'A1');
      expect(r.after_state).toHaveProperty('SERIE', '2619HA012345');
      expect(r.after_state).toHaveProperty('ESTATUS', 'ALMACEN');
    }
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts`
Expected: FAIL con "addEquipoRow is not exported".

- [ ] **Step 3: Implement in `adapter.ts`**

Agregar en `src/lib/inventory/adapter.ts`:

```typescript
export interface AddEquipoInput {
  oc:            string;
  modelo:        string;
  serie:         string;
  bodega?:       string;
  tonelada?:     number;
  descripcion?:  string;
  ref?:          string;
  seer?:         string;
  volts?:        string;
  usd?:          number;
  tc?:           number;
  fecha_compra?: string;
  folio_factura?: string;
  fecha_factura?: string;
}

export type AddEquipoResult =
  | { ok: true;  serie: string; bodega_asignada: string | null; row_index: number; after_state: Record<string, unknown> }
  | { ok: false; code: 'serie_already_exists'; existing_row_index: number }
  | { ok: false; code: 'invalid_input'; message: string };

function assignBodegaByTonelada(ton: number | undefined, canonical: string[]): string | null {
  if (ton == null) return null;
  if (ton <= 5 && canonical.includes('FLETEROS')) return 'FLETEROS';
  if (ton >  5 && canonical.includes('CENIZO'))   return 'CENIZO';
  return null;
}

export async function addEquipoRow(
  ctx: InventoryContext,
  input: AddEquipoInput,
): Promise<AddEquipoResult> {
  if (!input.serie?.trim()) return { ok: false, code: 'invalid_input', message: 'serie es requerida' };

  const existing = await findRowIndexBySerie(ctx, input.serie);
  if (existing) return { ok: false, code: 'serie_already_exists', existing_row_index: existing.tableRowIndex };

  const headers = await GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => { idx[String(h).trim().toUpperCase()] = i; });

  const bodega = input.bodega ?? assignBodegaByTonelada(input.tonelada, ctx.config.bodegas_canonicas);
  const costoMx = (input.usd != null && input.tc != null)
    ? Math.round(input.usd * input.tc * 100) / 100
    : null;

  const col = ctx.config.columns_historico;
  const row: unknown[] = new Array(headers.length).fill('');
  const put = (key: string, val: unknown) => {
    const colName = (col as Record<string, string>)[key];
    if (!colName) return;
    const i = idx[colName.toUpperCase()];
    if (i != null && val != null) row[i] = val;
  };

  put('oc',            input.oc);
  put('modelo',        input.modelo);
  put('serie',         input.serie);
  put('estatus',       'ALMACEN');
  put('bodega',        bodega);
  put('tonelada',      input.tonelada);
  put('descripcion',   input.descripcion);
  put('ref',           input.ref);
  put('seer',          input.seer);
  put('volts',         input.volts);
  put('usd',           input.usd);
  put('tc',            input.tc);
  put('costo_mx',      costoMx);
  put('fecha_compra',  input.fecha_compra ?? new Date().toISOString().slice(0, 10));
  put('folio_factura', input.folio_factura);
  put('fecha_factura', input.fecha_factura);

  const added = await GraphExcel.addTableRow(ctx.token, ctx.config.location, ctx.config.sheets.historico.table, row);

  const after_state: Record<string, unknown> = {};
  headers.forEach((h, i) => { after_state[String(h).trim().toUpperCase()] = row[i]; });

  return { ok: true, serie: input.serie.trim(), bodega_asignada: bodega, row_index: (added as { index: number }).index, after_state };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts`
Expected: PASS 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/adapter.ts src/lib/inventory/__tests__/adapter-writers.test.ts
git commit -m "feat(inventory): adapter.addEquipoRow + 7 unit tests (Fase 1 Nami)"
```

---

## Task 4: Adapter helper `patchEstatusBySerie`

**Files:**
- Modify: `src/lib/inventory/adapter.ts`
- Modify: `src/lib/inventory/__tests__/adapter-writers.test.ts`

**Interfaces:**
- Consumes: `findRowIndexBySerie`.
- Produces: `patchEstatusBySerie(ctx, serie, nuevo_estatus): Promise<{ok, no_op?, serie, estatus_anterior, estatus_nuevo, before_state, after_state, patched_columns}>`.

- [ ] **Step 1: Add failing tests**

Añadir a `src/lib/inventory/__tests__/adapter-writers.test.ts`:

```typescript
describe('patchEstatusBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cambia estatus ALMACEN → SEPARADO', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS']]);
    const gx = await import('../graph-excel');
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'SEPARADO');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estatus_anterior).toBe('ALMACEN');
      expect(r.estatus_nuevo).toBe('SEPARADO');
    }
    expect(gx.patchCell).toHaveBeenCalledOnce();
  });

  it('serie not found → ok:false con code serie_not_found', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','OTRA','ALMACEN']]);
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'SEPARADO');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('serie_not_found');
  });

  it('estatus actual == nuevo → no_op true, NO llama patchCell', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN']]);
    const gx = await import('../graph-excel');
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'ALMACEN');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.no_op).toBe(true);
    expect(gx.patchCell).not.toHaveBeenCalled();
  });

  it('before_state captura la row completa antes del patch (Review Focus #3 race con Tania)', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS']]);
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'SEPARADO');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before_state).toMatchObject({ OC: 'A1', SERIE: '2619HA012345', ESTATUS: 'ALMACEN' });
      expect(r.after_state).toMatchObject({ ESTATUS: 'SEPARADO' });
    }
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchEstatusBySerie`
Expected: FAIL.

- [ ] **Step 3: Implement**

Agregar en `src/lib/inventory/adapter.ts`:

```typescript
export type PatchEstatusResult =
  | { ok: true;  no_op?: boolean; serie: string; estatus_anterior: string; estatus_nuevo: string; before_state: Record<string, unknown>; after_state: Record<string, unknown>; patched_columns: string[]; table_row_index: number }
  | { ok: false; code: 'serie_not_found' };

function cellLetter(colIdx: number): string {
  let s = '';
  let n = colIdx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function rowToState(headers: string[], row: unknown[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  headers.forEach((h, i) => { o[String(h).trim().toUpperCase()] = row[i]; });
  return o;
}

export async function patchEstatusBySerie(
  ctx: InventoryContext,
  serie: string,
  nuevo_estatus: string,
): Promise<PatchEstatusResult> {
  const hit = await findRowIndexBySerie(ctx, serie);
  if (!hit) return { ok: false, code: 'serie_not_found' };

  const estatusColName = ctx.config.columns_historico.estatus;
  const estatusIdx = hit.headersMap[estatusColName.toUpperCase()];
  const estatus_anterior = String(hit.row[estatusIdx] ?? '').toUpperCase();
  const estatus_nuevo = nuevo_estatus.trim().toUpperCase();

  const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const before_state = rowToState(headers, hit.row);

  if (estatus_anterior === estatus_nuevo) {
    return {
      ok: true, no_op: true, serie: serie.trim().toUpperCase(),
      estatus_anterior, estatus_nuevo,
      before_state, after_state: before_state,
      patched_columns: [], table_row_index: hit.tableRowIndex,
    };
  }

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    const sheet = ctx.config.sheets.historico.name;
    const abs = hit.tableRowIndex + 2; // header row + 1-based
    await GraphExcel.patchCell(session, sheet, `${cellLetter(estatusIdx)}${abs}`, estatus_nuevo);
  });

  const after_row = [...hit.row]; after_row[estatusIdx] = estatus_nuevo;
  return {
    ok: true, serie: serie.trim().toUpperCase(),
    estatus_anterior, estatus_nuevo,
    before_state, after_state: rowToState(headers, after_row),
    patched_columns: [estatusColName.toUpperCase()],
    table_row_index: hit.tableRowIndex,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchEstatusBySerie`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/adapter.ts src/lib/inventory/__tests__/adapter-writers.test.ts
git commit -m "feat(inventory): adapter.patchEstatusBySerie + idempotency + 4 tests"
```

---

## Task 5: Adapter helper `patchClienteBySerie`

**Files:** `src/lib/inventory/adapter.ts`, `src/lib/inventory/__tests__/adapter-writers.test.ts`

**Interfaces:**
- Produces: `patchClienteBySerie(ctx, serie, {cliente_nombre, vendedor_codigo?, marcar_separado?, force?}): Promise<{ok, serie, cliente_asignado, vendedor, estatus_resultante, before_state, after_state, patched_columns, table_row_index} | {ok:false, code: 'serie_not_found' | 'cliente_assigned_conflict', current_cliente?}>`.

- [ ] **Step 1: Add failing tests**

```typescript
describe('patchClienteBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('asigna cliente a serie en ALMACEN + marca SEPARADO por default', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS',null,null,'','','','','',null,null,null,null,'VEND','']]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'Mauricio Guerra', vendedor_codigo: 'ANA' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cliente_asignado).toBe('Mauricio Guerra');
      expect(r.estatus_resultante).toBe('SEPARADO');
      expect(r.patched_columns).toContain('CLIENTE');
      expect(r.patched_columns).toContain('ESTATUS');
    }
  });

  it('marcar_separado=false NO toca estatus', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS',null,null,'','','','','',null,null,null,null,'','']]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'X', marcar_separado: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estatus_resultante).toBe('ALMACEN');
      expect(r.patched_columns).not.toContain('ESTATUS');
    }
  });

  it('rechaza conflict si cliente ya asignado + force=false', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; row[3] = 'SEPARADO'; row[HEADERS.indexOf('CLIENTE')] = 'Otro Cliente';
    await mockHeaders([row]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'Nuevo' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('cliente_assigned_conflict');
      expect(r.current_cliente).toBe('Otro Cliente');
    }
  });

  it('force=true permite reasignar cliente', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; row[3] = 'SEPARADO'; row[HEADERS.indexOf('CLIENTE')] = 'Otro Cliente';
    await mockHeaders([row]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'Nuevo', force: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cliente_asignado).toBe('Nuevo');
  });

  it('serie not found → serie_not_found', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'X' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('serie_not_found');
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchClienteBySerie`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
export interface PatchClienteInput {
  cliente_nombre:   string;
  vendedor_codigo?: string;
  marcar_separado?: boolean; // default true
  force?:           boolean; // default false
}

export type PatchClienteResult =
  | { ok: true;  serie: string; cliente_asignado: string; vendedor: string | null; estatus_resultante: string; before_state: Record<string, unknown>; after_state: Record<string, unknown>; patched_columns: string[]; table_row_index: number }
  | { ok: false; code: 'serie_not_found' }
  | { ok: false; code: 'cliente_assigned_conflict'; current_cliente: string };

export async function patchClienteBySerie(
  ctx: InventoryContext,
  serie: string,
  input: PatchClienteInput,
): Promise<PatchClienteResult> {
  const hit = await findRowIndexBySerie(ctx, serie);
  if (!hit) return { ok: false, code: 'serie_not_found' };

  const col = ctx.config.columns_historico;
  const clienteIdx = hit.headersMap[col.cliente.toUpperCase()];
  const vendedorIdx = col.vendedor ? hit.headersMap[col.vendedor.toUpperCase()] : undefined;
  const estatusIdx = hit.headersMap[col.estatus.toUpperCase()];

  const currentCliente = String(hit.row[clienteIdx] ?? '').trim();
  if (currentCliente && !input.force) {
    return { ok: false, code: 'cliente_assigned_conflict', current_cliente: currentCliente };
  }

  const marcar = input.marcar_separado !== false;
  const estatusActual = String(hit.row[estatusIdx] ?? '').toUpperCase();
  const willPatchEstatus = marcar && estatusActual === 'ALMACEN';

  const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const before_state = rowToState(headers, hit.row);

  const patched: string[] = [col.cliente.toUpperCase()];
  const after_row = [...hit.row];
  after_row[clienteIdx] = input.cliente_nombre;
  if (vendedorIdx != null && input.vendedor_codigo) {
    after_row[vendedorIdx] = input.vendedor_codigo;
    patched.push(col.vendedor!.toUpperCase());
  }
  if (willPatchEstatus) {
    after_row[estatusIdx] = 'SEPARADO';
    patched.push(col.estatus.toUpperCase());
  }

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    const sheet = ctx.config.sheets.historico.name;
    const abs = hit.tableRowIndex + 2;
    await GraphExcel.patchCell(session, sheet, `${cellLetter(clienteIdx)}${abs}`, input.cliente_nombre);
    if (vendedorIdx != null && input.vendedor_codigo) {
      await GraphExcel.patchCell(session, sheet, `${cellLetter(vendedorIdx)}${abs}`, input.vendedor_codigo);
    }
    if (willPatchEstatus) {
      await GraphExcel.patchCell(session, sheet, `${cellLetter(estatusIdx)}${abs}`, 'SEPARADO');
    }
  });

  return {
    ok: true, serie: serie.trim().toUpperCase(),
    cliente_asignado: input.cliente_nombre, vendedor: input.vendedor_codigo ?? null,
    estatus_resultante: willPatchEstatus ? 'SEPARADO' : estatusActual,
    before_state, after_state: rowToState(headers, after_row),
    patched_columns: patched, table_row_index: hit.tableRowIndex,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchClienteBySerie`
Expected: PASS 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/adapter.ts src/lib/inventory/__tests__/adapter-writers.test.ts
git commit -m "feat(inventory): adapter.patchClienteBySerie + conflict detection + 5 tests"
```

---

## Task 6: Adapter helper `patchVentaBySerie`

**Files:** `src/lib/inventory/adapter.ts`, `src/lib/inventory/__tests__/adapter-writers.test.ts`

**Interfaces:**
- Produces: `patchVentaBySerie(ctx, serie, {folio_venta, fecha_venta, factura_venta?, precio_unitario_mx, factor?}): Promise<...>`.

- [ ] **Step 1: Add failing tests**

```typescript
describe('patchVentaBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calcula factor = precio / costo_mx (4 decimales)', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill('');
    row[2] = '2619HA012345'; row[HEADERS.indexOf('COSTO MX')] = 26013.15;
    await mockHeaders([row]);
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.factor_calculado).toBe(1.3455);
    }
  });

  it('respeta factor explícito del user', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345';
    await mockHeaders([row]);
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000, factor: 1.5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.factor_calculado).toBe(1.5);
  });

  it('sin costo_mx y sin factor explícito → cannot_compute_factor', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; // COSTO MX vacío
    await mockHeaders([row]);
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('cannot_compute_factor');
  });

  it('patch 4 celdas en una sesión (folio, fecha, precio, factor)', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; row[HEADERS.indexOf('COSTO MX')] = 20000;
    await mockHeaders([row]);
    const gx = await import('../graph-excel');
    await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 30000 });
    expect((gx.patchCell as any).mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchVentaBySerie`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
export interface PatchVentaInput {
  folio_venta:         string;
  fecha_venta:         string;
  factura_venta?:      string;
  precio_unitario_mx:  number;
  factor?:             number;
}

export type PatchVentaResult =
  | { ok: true; serie: string; folio_venta: string; precio_unitario_mx: number; factor_calculado: number; before_state: Record<string, unknown>; after_state: Record<string, unknown>; patched_columns: string[]; table_row_index: number }
  | { ok: false; code: 'serie_not_found' }
  | { ok: false; code: 'cannot_compute_factor' };

export async function patchVentaBySerie(
  ctx: InventoryContext,
  serie: string,
  input: PatchVentaInput,
): Promise<PatchVentaResult> {
  const hit = await findRowIndexBySerie(ctx, serie);
  if (!hit) return { ok: false, code: 'serie_not_found' };

  const col = ctx.config.columns_historico;
  const costoMxIdx = col.costo_mx ? hit.headersMap[col.costo_mx.toUpperCase()] : undefined;
  const costoMxVal = costoMxIdx != null ? Number(hit.row[costoMxIdx]) : NaN;

  let factor = input.factor;
  if (factor == null) {
    if (!Number.isFinite(costoMxVal) || costoMxVal <= 0) return { ok: false, code: 'cannot_compute_factor' };
    factor = Math.round((input.precio_unitario_mx / costoMxVal) * 10000) / 10000;
  }

  const folioIdx = hit.headersMap[col.folio_venta.toUpperCase()];
  const fechaIdx = hit.headersMap[col.fecha_venta.toUpperCase()];
  const facturaIdx = col.factura_venta ? hit.headersMap[col.factura_venta.toUpperCase()] : undefined;
  const costoVtaIdx = col.costo_venta_mx ? hit.headersMap[col.costo_venta_mx.toUpperCase()] : undefined;

  const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
  const before_state = rowToState(headers, hit.row);
  const after_row = [...hit.row];

  const patched: string[] = [];
  const sheet = ctx.config.sheets.historico.name;
  const abs = hit.tableRowIndex + 2;

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    await GraphExcel.patchCell(session, sheet, `${cellLetter(folioIdx)}${abs}`, input.folio_venta);
    after_row[folioIdx] = input.folio_venta; patched.push(col.folio_venta.toUpperCase());

    await GraphExcel.patchCell(session, sheet, `${cellLetter(fechaIdx)}${abs}`, input.fecha_venta);
    after_row[fechaIdx] = input.fecha_venta; patched.push(col.fecha_venta.toUpperCase());

    if (facturaIdx != null && input.factura_venta) {
      await GraphExcel.patchCell(session, sheet, `${cellLetter(facturaIdx)}${abs}`, input.factura_venta);
      after_row[facturaIdx] = input.factura_venta; patched.push(col.factura_venta!.toUpperCase());
    }
    if (costoVtaIdx != null) {
      await GraphExcel.patchCell(session, sheet, `${cellLetter(costoVtaIdx)}${abs}`, input.precio_unitario_mx);
      after_row[costoVtaIdx] = input.precio_unitario_mx; patched.push(col.costo_venta_mx!.toUpperCase());
    }
  });

  return {
    ok: true, serie: serie.trim().toUpperCase(),
    folio_venta: input.folio_venta, precio_unitario_mx: input.precio_unitario_mx,
    factor_calculado: factor,
    before_state, after_state: rowToState(headers, after_row),
    patched_columns: patched, table_row_index: hit.tableRowIndex,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchVentaBySerie`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/adapter.ts src/lib/inventory/__tests__/adapter-writers.test.ts
git commit -m "feat(inventory): adapter.patchVentaBySerie + factor det + 4 tests"
```

---

## Task 7: Adapter helper `patchSalidaBySeries` (multi-serie)

**Files:** `src/lib/inventory/adapter.ts`, `src/lib/inventory/__tests__/adapter-writers.test.ts`

**Interfaces:**
- Produces: `patchSalidaBySeries(ctx, series, {folio_hoja, cliente_nombre, vendedor_codigo?, fecha?, proyecto?}): Promise<{ok, folio_hoja, series_registradas, series_not_found, conflicts, mutations: [...], message}>`.

- [ ] **Step 1: Add failing tests**

```typescript
describe('patchSalidaBySeries', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registra salida multi-serie: 2 series marcadas ENTREGADO', async () => {
    const { patchSalidaBySeries } = await import('../adapter');
    const r1 = new Array(HEADERS.length).fill(''); r1[2] = '2616HA045921'; r1[3] = 'SEPARADO';
    const r2 = new Array(HEADERS.length).fill(''); r2[2] = '2617HA02401A'; r2[3] = 'SEPARADO';
    await mockHeaders([r1, r2]);
    const r = await patchSalidaBySeries(CTX, ['2616HA045921', '2617HA02401A'], {
      folio_hoja: '4251', cliente_nombre: 'Mauricio Guerra', vendedor_codigo: 'ANA', fecha: '2026-10-01',
    });
    expect(r.series_registradas.sort()).toEqual(['2616HA045921', '2617HA02401A']);
    expect(r.series_not_found).toEqual([]);
  });

  it('serie no encontrada se reporta en series_not_found pero no aborta las otras', async () => {
    const { patchSalidaBySeries } = await import('../adapter');
    const r1 = new Array(HEADERS.length).fill(''); r1[2] = '2616HA045921';
    await mockHeaders([r1]);
    const r = await patchSalidaBySeries(CTX, ['2616HA045921', 'NO-EXISTE'], {
      folio_hoja: '4251', cliente_nombre: 'X', fecha: '2026-10-01',
    });
    expect(r.series_registradas).toContain('2616HA045921');
    expect(r.series_not_found).toContain('NO-EXISTE');
  });

  it('fecha inválida (no ISO) → rechaza con invalid_input (Review Focus #4)', async () => {
    const { patchSalidaBySeries } = await import('../adapter');
    await mockHeaders([]);
    const r = await patchSalidaBySeries(CTX, ['X'], { folio_hoja: '4251', cliente_nombre: 'Y', fecha: '1 de octubre' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('invalid_input');
  });

  it('fecha default = hoy si no se pasa (ISO YYYY-MM-DD)', async () => {
    const { patchSalidaBySeries } = await import('../adapter');
    const r1 = new Array(HEADERS.length).fill(''); r1[2] = '2616HA045921';
    await mockHeaders([r1]);
    const r = await patchSalidaBySeries(CTX, ['2616HA045921'], { folio_hoja: '4251', cliente_nombre: 'X' });
    expect(r.ok).toBe(true);
    // No explicit assertion on fecha_default, pero debe no crashear.
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchSalidaBySeries`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
export interface PatchSalidaInput {
  folio_hoja:      string;
  cliente_nombre:  string;
  vendedor_codigo?: string;
  fecha?:          string;
  proyecto?:       string;
}

export type SalidaMutation = {
  serie:           string;
  table_row_index: number;
  before_state:    Record<string, unknown>;
  after_state:     Record<string, unknown>;
  patched_columns: string[];
  conflict?:       string;
};

export type PatchSalidaResult =
  | { ok: true; folio_hoja: string; series_registradas: string[]; series_not_found: string[]; conflicts: string[]; mutations: SalidaMutation[]; message: string }
  | { ok: false; code: 'invalid_input'; message: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function patchSalidaBySeries(
  ctx: InventoryContext,
  series: string[],
  input: PatchSalidaInput,
): Promise<PatchSalidaResult> {
  if (input.fecha && !ISO_DATE_RE.test(input.fecha)) {
    return { ok: false, code: 'invalid_input', message: `fecha debe ser YYYY-MM-DD; recibí "${input.fecha}"` };
  }
  const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
  if (!series.length) return { ok: false, code: 'invalid_input', message: 'series requiere al menos 1 elemento' };

  const col = ctx.config.columns_historico;
  const series_registradas: string[] = [];
  const series_not_found:   string[] = [];
  const conflicts:          string[] = [];
  const mutations:          SalidaMutation[] = [];

  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    const sheet = ctx.config.sheets.historico.name;
    for (const s of series) {
      const hit = await findRowIndexBySerie(ctx, s);
      if (!hit) { series_not_found.push(s); continue; }

      const estatusIdx = hit.headersMap[col.estatus.toUpperCase()];
      const clienteIdx = hit.headersMap[col.cliente.toUpperCase()];
      const vendedorIdx = col.vendedor ? hit.headersMap[col.vendedor.toUpperCase()] : undefined;
      const fechaIdx = hit.headersMap[col.fecha_venta.toUpperCase()];
      const folioSalidaIdx = hit.headersMap['FOLIO SALIDA'];

      const headers = Object.entries(hit.headersMap).sort((a, b) => a[1] - b[1]).map(([h]) => h);
      const before_state = rowToState(headers, hit.row);
      const after_row = [...hit.row];
      const patched: string[] = [];
      let conflictMsg: string | undefined;

      const abs = hit.tableRowIndex + 2;

      await GraphExcel.patchCell(session, sheet, `${cellLetter(estatusIdx)}${abs}`, 'ENTREGADO');
      after_row[estatusIdx] = 'ENTREGADO'; patched.push(col.estatus.toUpperCase());

      const currentCliente = String(hit.row[clienteIdx] ?? '').trim();
      if (!currentCliente) {
        await GraphExcel.patchCell(session, sheet, `${cellLetter(clienteIdx)}${abs}`, input.cliente_nombre);
        after_row[clienteIdx] = input.cliente_nombre; patched.push(col.cliente.toUpperCase());
      } else if (currentCliente.toLowerCase() !== input.cliente_nombre.toLowerCase()) {
        conflictMsg = `serie ${s} ya estaba asignada a "${currentCliente}" (no sobre-escribí)`;
        conflicts.push(conflictMsg);
      }

      if (vendedorIdx != null && input.vendedor_codigo) {
        const currentVend = String(hit.row[vendedorIdx] ?? '').trim();
        if (!currentVend) {
          await GraphExcel.patchCell(session, sheet, `${cellLetter(vendedorIdx)}${abs}`, input.vendedor_codigo);
          after_row[vendedorIdx] = input.vendedor_codigo; patched.push(col.vendedor!.toUpperCase());
        }
      }

      await GraphExcel.patchCell(session, sheet, `${cellLetter(fechaIdx)}${abs}`, fecha);
      after_row[fechaIdx] = fecha; patched.push(col.fecha_venta.toUpperCase());

      if (folioSalidaIdx != null) {
        await GraphExcel.patchCell(session, sheet, `${cellLetter(folioSalidaIdx)}${abs}`, input.folio_hoja);
        after_row[folioSalidaIdx] = input.folio_hoja; patched.push('FOLIO SALIDA');
      }

      series_registradas.push(hit.row[hit.headersMap[col.serie.toUpperCase()]] as string);
      mutations.push({ serie: s, table_row_index: hit.tableRowIndex, before_state, after_state: rowToState(headers, after_row), patched_columns: patched, ...(conflictMsg ? { conflict: conflictMsg } : {}) });
    }
  });

  const message = `Hoja de salida ${input.folio_hoja} registrada: ${series_registradas.length} equipos entregados a ${input.cliente_nombre}.${series_not_found.length ? ` Series no encontradas: ${series_not_found.join(', ')}.` : ''}`;
  return { ok: true, folio_hoja: input.folio_hoja, series_registradas, series_not_found, conflicts, mutations, message };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/inventory/__tests__/adapter-writers.test.ts -t patchSalidaBySeries`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/adapter.ts src/lib/inventory/__tests__/adapter-writers.test.ts
git commit -m "feat(inventory): adapter.patchSalidaBySeries multi-serie + 4 tests"
```

---

## Task 8: Tool schemas + channel-mapping wire

**Files:**
- Modify: `src/lib/tools/registry.ts` (agregar 5 schemas)
- Modify: `src/lib/tools/channel-mapping.ts` (wire a chat; voice OFF para Nami pero placeholder; email ignored)
- Modify: `src/lib/vapi/sync.ts` MEERKAT_VOICE_DISTRIBUTION (nami agrega 5 nombres de voice tool)
- Test: `src/lib/tools/__tests__/registry-inventory-writers.test.ts` (nuevo)

**Interfaces:**
- Produces: 5 Anthropic.Tool shapes exportables como `TOOL_SCHEMAS['inv_agregar_equipo']` etc. Consumidas por Tasks 9-13 (handlers via `toAnthropicTool(TOOL_SCHEMAS[name])`).

- [ ] **Step 1: Write failing test**

Create `src/lib/tools/__tests__/registry-inventory-writers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TOOL_SCHEMAS, toAnthropicTool } from '../schemas';

const WRITE_TOOLS = ['inv_agregar_equipo', 'inv_actualizar_estatus', 'inv_asignar_cliente', 'inv_registrar_venta', 'inv_registrar_salida'] as const;

describe('inventory writer tool schemas', () => {
  for (const name of WRITE_TOOLS) {
    it(`${name} está registrada en TOOL_SCHEMAS`, () => {
      expect(TOOL_SCHEMAS[name]).toBeDefined();
    });

    it(`${name} genera Anthropic.Tool válido`, () => {
      const t = toAnthropicTool(TOOL_SCHEMAS[name]);
      expect(t.name).toBe(name);
      expect(t.input_schema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(50);
    });
  }

  it('inv_agregar_equipo tiene campos requeridos: oc, modelo, serie', () => {
    const t = toAnthropicTool(TOOL_SCHEMAS['inv_agregar_equipo']);
    expect((t.input_schema as any).required).toEqual(expect.arrayContaining(['oc', 'modelo', 'serie']));
  });

  it('inv_registrar_salida acepta array de series', () => {
    const t = toAnthropicTool(TOOL_SCHEMAS['inv_registrar_salida']);
    const seriesProp = (t.input_schema as any).properties.series;
    expect(seriesProp.type).toBe('array');
    expect(seriesProp.items.type).toBe('string');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/lib/tools/__tests__/registry-inventory-writers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add schemas to `src/lib/tools/schemas.ts` (o archivo equivalente que tiene TOOL_SCHEMAS)**

Primero verifica dónde vive TOOL_SCHEMAS:
```bash
grep -l "^export const TOOL_SCHEMAS" src/lib/tools/*.ts
```

Agrega las 5 entradas al objeto. Ejemplo del shape (adapta al estilo existente del archivo):

```typescript
TOOL_SCHEMAS['inv_agregar_equipo'] = {
  description: 'Nami: agrega un equipo nuevo al INVENTARIO cuando llega físicamente al almacén y Camila te dice los datos (OC, modelo, serie del label, tonelada, costos TRANE). Bodega se autoasigna por tonelada (≤5TR FLETEROS, >5TR CENIZO) si no la especificas.',
  input_schema: {
    type: 'object',
    properties: {
      oc:            { type: 'string', description: 'Folio de la OC en QuickBooks.' },
      modelo:        { type: 'string', description: 'Modelo del equipo.' },
      serie:         { type: 'string', description: 'Número de serie del label físico. CRÍTICO: NO inventar, usar el que viene en el equipo.' },
      bodega:        { type: 'string', description: 'FLETEROS o CENIZO. Opcional, se autoasigna por tonelada.' },
      tonelada:      { type: 'number', description: 'Toneladas de refrigeración.' },
      descripcion:   { type: 'string' },
      ref:           { type: 'string', description: 'Refrigerante (R410A, R32, etc).' },
      seer:          { type: 'string' },
      volts:         { type: 'string' },
      usd:           { type: 'number', description: 'Costo en USD de la factura TRANE.' },
      tc:            { type: 'number', description: 'Tipo de cambio. costo_mx = usd * tc se calcula automáticamente.' },
      fecha_compra:  { type: 'string', description: 'YYYY-MM-DD. Default hoy si no se pasa.' },
      folio_factura: { type: 'string' },
      fecha_factura: { type: 'string', description: 'YYYY-MM-DD.' },
    },
    required: ['oc', 'modelo', 'serie'],
  },
};

TOOL_SCHEMAS['inv_actualizar_estatus'] = {
  description: 'Nami: cambia el estatus de un equipo por serie. Transiciones típicas: ALMACEN→SEPARADO al pagar cliente, SEPARADO→ENTREGADO al salir. Si ya estaba en el estatus pedido, no toca nada.',
  input_schema: {
    type: 'object',
    properties: {
      serie:         { type: 'string' },
      nuevo_estatus: { type: 'string', enum: ['ALMACEN', 'SEPARADO', 'ENTREGADO', 'PENDIENTE', 'PEDIDO', 'DEVUELTO', 'DESHABILITADO'] },
      notas:         { type: 'string', description: 'Razón del cambio, va al audit log.' },
    },
    required: ['serie', 'nuevo_estatus'],
  },
};

TOOL_SCHEMAS['inv_asignar_cliente'] = {
  description: 'Nami: asigna un equipo a un cliente cuando ventas confirma que pagó. Marca el equipo como SEPARADO automáticamente (si estaba en ALMACEN). Rechaza si ya tiene otro cliente asignado, salvo que pases force=true.',
  input_schema: {
    type: 'object',
    properties: {
      serie:            { type: 'string' },
      cliente_nombre:   { type: 'string' },
      vendedor_codigo:  { type: 'string', description: 'Códigos conocidos AC: ANA, ANG, MTP, RLP. O libre.' },
      marcar_separado:  { type: 'boolean', description: 'Si true (default), también cambia estatus a SEPARADO.' },
      force:            { type: 'boolean', description: 'Si true, reemplaza cliente existente sin confirmar.' },
    },
    required: ['serie', 'cliente_nombre'],
  },
};

TOOL_SCHEMAS['inv_registrar_venta'] = {
  description: 'Nami: registra la venta cuando llega el folio de factura venta de Solución Factible. Guarda folio, fecha, precio y calcula el factor (precio / costo_mx). No cambia estatus (asume ENTREGADO ya via inv_registrar_salida).',
  input_schema: {
    type: 'object',
    properties: {
      serie:               { type: 'string' },
      folio_venta:         { type: 'string', description: 'Folio del CFDI de venta.' },
      fecha_venta:         { type: 'string', description: 'YYYY-MM-DD.' },
      factura_venta:       { type: 'string', description: 'Serie/folio alternativo si distinto.' },
      precio_unitario_mx:  { type: 'number' },
      factor:              { type: 'number', description: 'Opcional. Si no se pasa, se calcula = precio / costo_mx.' },
    },
    required: ['serie', 'folio_venta', 'fecha_venta', 'precio_unitario_mx'],
  },
};

TOOL_SCHEMAS['inv_registrar_salida'] = {
  description: 'Nami: registra una hoja de salida física (el taco pre-impreso con folio en rojo que firma el cliente) cuando sale uno o varios equipos del almacén. Marca cada serie como ENTREGADO, asigna cliente y vendedor si no estaban, y guarda el folio de la hoja.',
  input_schema: {
    type: 'object',
    properties: {
      folio_hoja:       { type: 'string', description: 'Folio del taco pre-impreso (ej. 4251).' },
      cliente_nombre:   { type: 'string' },
      vendedor_codigo:  { type: 'string' },
      fecha:            { type: 'string', description: 'YYYY-MM-DD. Default hoy si no se pasa.' },
      series:           { type: 'array', items: { type: 'string' }, description: 'Series de los equipos que salen juntos en esa hoja.', minItems: 1 },
      proyecto:         { type: 'string' },
    },
    required: ['folio_hoja', 'cliente_nombre', 'series'],
  },
};
```

- [ ] **Step 4: Wire a channel-mapping**

En `src/lib/tools/channel-mapping.ts` buscar el objeto `VOICE_TO_CHAT` (o equivalente) y agregar las 5 tools como pass-through:

```typescript
VOICE_TO_CHAT['inv_agregar_equipo']    = 'inv_agregar_equipo';
VOICE_TO_CHAT['inv_actualizar_estatus'] = 'inv_actualizar_estatus';
VOICE_TO_CHAT['inv_asignar_cliente']   = 'inv_asignar_cliente';
VOICE_TO_CHAT['inv_registrar_venta']   = 'inv_registrar_venta';
VOICE_TO_CHAT['inv_registrar_salida']  = 'inv_registrar_salida';
```

- [ ] **Step 5: Wire a sync.ts voice distribution**

En `src/lib/vapi/sync.ts:293` agregar las 5 al array nami:

```typescript
nami: [
  'inv_buscar_por_serie', 'inv_buscar_por_modelo', 'inv_buscar_por_cliente',
  'inv_stock_snapshot', 'inv_pedir_reposicion',
  'inv_agregar_equipo', 'inv_actualizar_estatus', 'inv_asignar_cliente',
  'inv_registrar_venta', 'inv_registrar_salida',
  'llamar_a', 'buscar_directorio', 'enviar_correo',
],
```

- [ ] **Step 6: Run test, verify pass**

Run: `npx vitest run src/lib/tools/__tests__/registry-inventory-writers.test.ts`
Expected: PASS.

Run: `npx vitest run src/lib/tools/__tests__/` (regresión de registry)
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/schemas.ts src/lib/tools/channel-mapping.ts src/lib/vapi/sync.ts src/lib/tools/__tests__/registry-inventory-writers.test.ts
git commit -m "feat(inventory): schemas de 5 writers + wire channel-mapping + sync nami"
```

---

## Task 9: Executor handler `inv_agregar_equipo`

**Files:**
- Modify: `src/lib/tools/executor.ts` (agregar case `inv_agregar_equipo`)
- Modify: `src/lib/inventory/adapter.ts` (export helper `insertMutationLog`)
- Test: `src/lib/tools/__tests__/executor-inv-agregar-equipo.test.ts` (nuevo)

**Interfaces:**
- Consumes: `addEquipoRow` (Task 3), `resolveInventoryContext`, `consumeAiOp` + `refundOps`, new helper `insertMutationLog(supabase, {...})`.

- [ ] **Step 1: Add helper `insertMutationLog` in adapter**

```typescript
export async function insertMutationLog(
  supabase: SupabaseClient,
  entry: {
    portal_email:    string;
    agent_id:        string | null;
    tool_name:       string;
    serie:           string | null;
    table_row_index: number | null;
    before_state:    Record<string, unknown> | null;
    after_state:     Record<string, unknown>;
    patched_columns: string[];
    metadata:        Record<string, unknown> | null;
    ops_charged:     number;
    success:         boolean;
    error_code:      string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('inventory_mutations_log').insert(entry);
  if (error) console.error('[inventory-mutations-log] insert failed:', error.message);
}
```

- [ ] **Step 2: Write failing test**

Create `src/lib/tools/__tests__/executor-inv-agregar-equipo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveInv: vi.fn(),
  addEquipoRow: vi.fn(),
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   vi.fn(),
  insertLog:   vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  addEquipoRow:            mocks.addEquipoRow,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mocks.consumeAiOp,
  refundOps:   mocks.refundOps,
}));

async function runTool(input: Record<string, unknown>) {
  const { executeAgentTool } = await import('@/lib/tools/executor');
  return executeAgentTool('inv_agregar_equipo', input, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_agregar_equipo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path: adapter OK → tool ok con mensaje narrable + audit log insert', async () => {
    mocks.addEquipoRow.mockResolvedValue({
      ok: true, serie: '2619HA012345', bodega_asignada: 'FLETEROS', row_index: 10,
      after_state: { OC: 'A1', SERIE: '2619HA012345', ESTATUS: 'ALMACEN' },
    });
    const r = await runTool({ oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 3 });
    expect((r as any).ok).toBe(true);
    expect((r as any).message).toContain('FLETEROS');
    expect(mocks.insertLog).toHaveBeenCalledOnce();
  });

  it('adapter not_configured → refund + mensaje de setup', async () => {
    mocks.resolveInv.mockResolvedValue({ error: 'not_configured', message: 'Configura el Excel...' });
    const r = await runTool({ oc: 'A1', modelo: '4TXK', serie: 'X' });
    expect((r as any).ok).toBe(false);
    expect(mocks.refundOps).toHaveBeenCalled();
  });

  it('adapter serie_already_exists → ok:false, cobra (es error de negocio)', async () => {
    mocks.addEquipoRow.mockResolvedValue({ ok: false, code: 'serie_already_exists', existing_row_index: 7 });
    const r = await runTool({ oc: 'A1', modelo: '4TXK', serie: '2619HA012345' });
    expect((r as any).ok).toBe(false);
    expect(mocks.refundOps).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: false, error_code: 'serie_already_exists' }));
  });

  it('feature flag inventory_write_enabled=false → bloquea con write_not_enabled', async () => {
    const { executeAgentTool } = await import('@/lib/tools/executor');
    const r = await executeAgentTool('inv_agregar_equipo', { oc: 'A1', modelo: '4TXK', serie: 'X' }, {
      agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
      agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
      agent: { id: 'agent-1', features: {} },
      supabase: {} as never, channel: 'chat',
    });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('write_not_enabled');
  });
});
```

- [ ] **Step 3: Run test, verify fail**

Run: `npx vitest run src/lib/tools/__tests__/executor-inv-agregar-equipo.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement handler**

En `src/lib/tools/executor.ts` dentro del bloque de inv_ tools (~line 5455), agregar:

```typescript
const INV_WRITE_TOOLS = new Set(['inv_agregar_equipo', 'inv_actualizar_estatus', 'inv_asignar_cliente', 'inv_registrar_venta', 'inv_registrar_salida']);

if (INV_WRITE_TOOLS.has(toolName)) {
  const flag = (agent.features as Record<string, unknown> | undefined)?.inventory_write_enabled === true;
  if (!flag) return { ok: false, error: 'Write disabled para este agente.', code: 'write_not_enabled' };
}

if (toolName === 'inv_agregar_equipo') {
  const { resolveInventoryContext, addEquipoRow, insertMutationLog } = await import('@/lib/inventory/adapter');
  const ctx = await resolveInventoryContext(portalEmail, supabase, agentId);
  if ('error' in ctx) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: ${ctx.error}` });
    return { ok: false, error: ctx.message, code: ctx.error };
  }
  const result = await addEquipoRow(ctx, args as never);
  const serie = (args as { serie?: string }).serie ?? null;
  await insertMutationLog(supabase, {
    portal_email:    portalEmail,
    agent_id:        agentId,
    tool_name:       toolName,
    serie,
    table_row_index: result.ok ? result.row_index : null,
    before_state:    null,
    after_state:     result.ok ? result.after_state : {},
    patched_columns: [],
    metadata:        null,
    ops_charged:     1,
    success:         result.ok,
    error_code:      result.ok ? null : result.code,
  });
  if (!result.ok) {
    return { ok: false, error: `No pude agregar el equipo: ${result.code === 'serie_already_exists' ? `la serie ya está en el inventario (row ${result.existing_row_index})` : (result as { message?: string }).message ?? result.code}`, code: result.code };
  }
  return {
    ok: true,
    serie: result.serie,
    bodega_asignada: result.bodega_asignada,
    row_index: result.row_index,
    message: `Agregado equipo serie ${result.serie} a bodega ${result.bodega_asignada ?? 'sin asignar'} en row ${result.row_index}.`,
  };
}
```

- [ ] **Step 5: Run test, verify pass**

Run: `npx vitest run src/lib/tools/__tests__/executor-inv-agregar-equipo.test.ts`
Expected: PASS 4/4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/executor.ts src/lib/inventory/adapter.ts src/lib/tools/__tests__/executor-inv-agregar-equipo.test.ts
git commit -m "feat(inventory): handler inv_agregar_equipo + flag gate + audit log + 4 tests"
```

---

## Task 10: Executor handler `inv_actualizar_estatus`

**Files:**
- Modify: `src/lib/tools/executor.ts`
- Test: `src/lib/tools/__tests__/executor-inv-actualizar-estatus.test.ts` (nuevo)

**Interfaces:**
- Consumes: `patchEstatusBySerie(ctx, serie, nuevo_estatus): Promise<PatchEstatusResult>` (de Task 4), `insertMutationLog` (helper added in Task 9), `resolveInventoryContext`, `refundOps`.

- [ ] **Step 1: Write failing test**

Create `src/lib/tools/__tests__/executor-inv-actualizar-estatus.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveInv:        vi.fn(),
  patchEstatus:      vi.fn(),
  insertLog:         vi.fn(),
  refundOps:         vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchEstatusBySerie:     mocks.patchEstatus,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>, flagOn = true) {
  const { executeAgentTool } = await import('@/lib/tools/executor');
  return executeAgentTool('inv_actualizar_estatus', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: flagOn ? { inventory_write_enabled: true } : {} },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_actualizar_estatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path: ALMACEN → SEPARADO con mensaje narrable', async () => {
    mocks.patchEstatus.mockResolvedValue({
      ok: true, serie: '2619HA012345', estatus_anterior: 'ALMACEN', estatus_nuevo: 'SEPARADO',
      before_state: { ESTATUS: 'ALMACEN' }, after_state: { ESTATUS: 'SEPARADO' },
      patched_columns: ['ESTATUS'], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', nuevo_estatus: 'SEPARADO' });
    expect((r as any).ok).toBe(true);
    expect((r as any).message).toContain('ALMACEN → SEPARADO');
    expect(mocks.insertLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: true, patched_columns: ['ESTATUS'] }));
  });

  it('serie_not_found → ok:false, cobra (negocio)', async () => {
    mocks.patchEstatus.mockResolvedValue({ ok: false, code: 'serie_not_found' });
    const r = await runTool({ serie: 'X', nuevo_estatus: 'SEPARADO' });
    expect((r as any).ok).toBe(false);
    expect(mocks.refundOps).not.toHaveBeenCalled();
    expect(mocks.insertLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: false, error_code: 'serie_not_found' }));
  });

  it('no_op → ok:true con mensaje "ya estaba en X"', async () => {
    mocks.patchEstatus.mockResolvedValue({
      ok: true, no_op: true, serie: '2619HA012345', estatus_anterior: 'ALMACEN', estatus_nuevo: 'ALMACEN',
      before_state: { ESTATUS: 'ALMACEN' }, after_state: { ESTATUS: 'ALMACEN' },
      patched_columns: [], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', nuevo_estatus: 'ALMACEN' });
    expect((r as any).ok).toBe(true);
    expect((r as any).no_op).toBe(true);
    expect((r as any).message).toContain('ya estaba en ALMACEN');
  });

  it('flag off → write_not_enabled', async () => {
    const r = await runTool({ serie: 'X', nuevo_estatus: 'SEPARADO' }, false);
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('write_not_enabled');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/lib/tools/__tests__/executor-inv-actualizar-estatus.test.ts`
Expected: FAIL con "handler no implementado para inv_actualizar_estatus".

- [ ] **Step 3: Implement handler**

```typescript
if (toolName === 'inv_actualizar_estatus') {
  const { resolveInventoryContext, patchEstatusBySerie, insertMutationLog } = await import('@/lib/inventory/adapter');
  const a = args as { serie: string; nuevo_estatus: string; notas?: string };
  const ctx = await resolveInventoryContext(portalEmail, supabase, agentId);
  if ('error' in ctx) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: ${ctx.error}` });
    return { ok: false, error: ctx.message, code: ctx.error };
  }
  const result = await patchEstatusBySerie(ctx, a.serie, a.nuevo_estatus);
  await insertMutationLog(supabase, {
    portal_email: portalEmail, agent_id: agentId, tool_name: toolName,
    serie: a.serie, table_row_index: result.ok ? result.table_row_index : null,
    before_state: result.ok ? result.before_state : null,
    after_state:  result.ok ? result.after_state  : {},
    patched_columns: result.ok ? result.patched_columns : [],
    metadata: a.notas ? { notas: a.notas } : null,
    ops_charged: 1, success: result.ok,
    error_code: result.ok ? null : result.code,
  });
  if (!result.ok) {
    return { ok: false, error: `No encontré el equipo con serie ${a.serie}.`, code: 'serie_not_found' };
  }
  if (result.no_op) {
    return { ok: true, no_op: true, message: `Serie ${result.serie} ya estaba en ${result.estatus_nuevo}, no toqué nada.` };
  }
  return { ok: true, serie: result.serie, estatus_anterior: result.estatus_anterior, estatus_nuevo: result.estatus_nuevo,
    message: `Serie ${result.serie}: ${result.estatus_anterior} → ${result.estatus_nuevo}.` };
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executor.ts src/lib/tools/__tests__/executor-inv-actualizar-estatus.test.ts
git commit -m "feat(inventory): handler inv_actualizar_estatus + idempotency + 4 tests"
```

---

## Task 11: Executor handler `inv_asignar_cliente`

**Files:**
- Modify: `src/lib/tools/executor.ts`
- Test: `src/lib/tools/__tests__/executor-inv-asignar-cliente.test.ts` (nuevo)

**Interfaces:**
- Consumes: `patchClienteBySerie(ctx, serie, {cliente_nombre, vendedor_codigo?, marcar_separado?, force?}): Promise<PatchClienteResult>` (de Task 5).

- [ ] **Step 1: Write failing test**

Create `src/lib/tools/__tests__/executor-inv-asignar-cliente.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveInv:    vi.fn(),
  patchCliente:  vi.fn(),
  insertLog:     vi.fn(),
  refundOps:     vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchClienteBySerie:     mocks.patchCliente,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>) {
  const { executeAgentTool } = await import('@/lib/tools/executor');
  return executeAgentTool('inv_asignar_cliente', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_asignar_cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path marcar_separado default → asigna cliente + marca SEPARADO', async () => {
    mocks.patchCliente.mockResolvedValue({
      ok: true, serie: '2619HA012345', cliente_asignado: 'Mauricio Guerra', vendedor: 'ANA',
      estatus_resultante: 'SEPARADO',
      before_state: { CLIENTE: '' }, after_state: { CLIENTE: 'Mauricio Guerra', ESTATUS: 'SEPARADO' },
      patched_columns: ['CLIENTE', 'VEND', 'ESTATUS'], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', cliente_nombre: 'Mauricio Guerra', vendedor_codigo: 'ANA' });
    expect((r as any).ok).toBe(true);
    expect((r as any).message).toContain('Mauricio Guerra');
    expect((r as any).message).toContain('SEPARADA');
  });

  it('cliente_assigned_conflict → mensaje incluye current_cliente', async () => {
    mocks.patchCliente.mockResolvedValue({ ok: false, code: 'cliente_assigned_conflict', current_cliente: 'Otro Cliente' });
    const r = await runTool({ serie: '2619HA012345', cliente_nombre: 'Nuevo' });
    expect((r as any).ok).toBe(false);
    expect((r as any).error).toContain('Otro Cliente');
    expect((r as any).error).toContain('force=true');
  });

  it('force=true pasa a adapter correctamente', async () => {
    mocks.patchCliente.mockResolvedValue({
      ok: true, serie: '2619HA012345', cliente_asignado: 'Nuevo', vendedor: null,
      estatus_resultante: 'SEPARADO',
      before_state: {}, after_state: {}, patched_columns: ['CLIENTE'], table_row_index: 5,
    });
    await runTool({ serie: '2619HA012345', cliente_nombre: 'Nuevo', force: true });
    expect(mocks.patchCliente).toHaveBeenCalledWith(expect.anything(), '2619HA012345', expect.objectContaining({ force: true }));
  });

  it('serie_not_found → ok:false', async () => {
    mocks.patchCliente.mockResolvedValue({ ok: false, code: 'serie_not_found' });
    const r = await runTool({ serie: 'X', cliente_nombre: 'Y' });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('serie_not_found');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/lib/tools/__tests__/executor-inv-asignar-cliente.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement handler**

En `src/lib/tools/executor.ts` dentro del bloque inv_, agregar:

```typescript
if (toolName === 'inv_asignar_cliente') {
  const { resolveInventoryContext, patchClienteBySerie, insertMutationLog } = await import('@/lib/inventory/adapter');
  const a = args as { serie: string; cliente_nombre: string; vendedor_codigo?: string; marcar_separado?: boolean; force?: boolean };
  const ctx = await resolveInventoryContext(portalEmail, supabase, agentId);
  if ('error' in ctx) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: ${ctx.error}` });
    return { ok: false, error: ctx.message, code: ctx.error };
  }
  const result = await patchClienteBySerie(ctx, a.serie, a);
  await insertMutationLog(supabase, {
    portal_email: portalEmail, agent_id: agentId, tool_name: toolName,
    serie: a.serie, table_row_index: result.ok ? result.table_row_index : null,
    before_state: result.ok ? result.before_state : null,
    after_state:  result.ok ? result.after_state  : {},
    patched_columns: result.ok ? result.patched_columns : [],
    metadata: null, ops_charged: 1,
    success: result.ok, error_code: result.ok ? null : result.code,
  });
  if (!result.ok) {
    if (result.code === 'cliente_assigned_conflict') {
      return { ok: false, error: `La serie ${a.serie} ya está asignada a "${result.current_cliente}". Usa force=true si quieres reemplazar.`, code: result.code };
    }
    return { ok: false, error: `No encontré el equipo con serie ${a.serie}.`, code: 'serie_not_found' };
  }
  return {
    ok: true, serie: result.serie,
    cliente_asignado: result.cliente_asignado, vendedor: result.vendedor,
    estatus_resultante: result.estatus_resultante,
    message: `Serie ${result.serie} asignada a ${result.cliente_asignado}${result.vendedor ? ` (vendedor ${result.vendedor})` : ''}${result.estatus_resultante === 'SEPARADO' ? ', marcada SEPARADA' : ''}.`,
  };
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executor.ts src/lib/tools/__tests__/executor-inv-asignar-cliente.test.ts
git commit -m "feat(inventory): handler inv_asignar_cliente + conflict handling + 4 tests"
```

---

## Task 12: Executor handler `inv_registrar_venta`

**Files:**
- Modify: `src/lib/tools/executor.ts`
- Test: `src/lib/tools/__tests__/executor-inv-registrar-venta.test.ts` (nuevo)

**Interfaces:**
- Consumes: `patchVentaBySerie(ctx, serie, {folio_venta, fecha_venta, factura_venta?, precio_unitario_mx, factor?}): Promise<PatchVentaResult>` (de Task 6).

- [ ] **Step 1: Write failing test**

Create `src/lib/tools/__tests__/executor-inv-registrar-venta.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveInv:  vi.fn(),
  patchVenta:  vi.fn(),
  insertLog:   vi.fn(),
  refundOps:   vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchVentaBySerie:       mocks.patchVenta,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>) {
  const { executeAgentTool } = await import('@/lib/tools/executor');
  return executeAgentTool('inv_registrar_venta', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_registrar_venta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy path con factor calculado → mensaje narrable', async () => {
    mocks.patchVenta.mockResolvedValue({
      ok: true, serie: '2619HA012345', folio_venta: 'FV-1', precio_unitario_mx: 35000,
      factor_calculado: 1.3455,
      before_state: {}, after_state: {}, patched_columns: ['FOLIO', 'FECHA DE VENTA'], table_row_index: 5,
    });
    const r = await runTool({ serie: '2619HA012345', folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(true);
    expect((r as any).message).toContain('1.3455');
    expect((r as any).message).toContain('FV-1');
  });

  it('cannot_compute_factor → mensaje accionable', async () => {
    mocks.patchVenta.mockResolvedValue({ ok: false, code: 'cannot_compute_factor' });
    const r = await runTool({ serie: 'X', folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(false);
    expect((r as any).error).toContain('costo_mx');
  });

  it('fecha_venta no ISO → invalid_input + refund (Review Focus #4)', async () => {
    const r = await runTool({ serie: 'X', folio_venta: 'FV-1', fecha_venta: '1 de octubre', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('invalid_input');
    expect(mocks.refundOps).toHaveBeenCalled();
    expect(mocks.patchVenta).not.toHaveBeenCalled();
  });

  it('serie_not_found → ok:false', async () => {
    mocks.patchVenta.mockResolvedValue({ ok: false, code: 'serie_not_found' });
    const r = await runTool({ serie: 'X', folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('serie_not_found');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Implement handler**

```typescript
if (toolName === 'inv_registrar_venta') {
  const a = args as { serie: string; folio_venta: string; fecha_venta: string; factura_venta?: string; precio_unitario_mx: number; factor?: number };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha_venta)) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: invalid_date` });
    return { ok: false, error: `fecha_venta debe ser YYYY-MM-DD; recibí "${a.fecha_venta}".`, code: 'invalid_input' };
  }
  const { resolveInventoryContext, patchVentaBySerie, insertMutationLog } = await import('@/lib/inventory/adapter');
  const ctx = await resolveInventoryContext(portalEmail, supabase, agentId);
  if ('error' in ctx) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: ${ctx.error}` });
    return { ok: false, error: ctx.message, code: ctx.error };
  }
  const result = await patchVentaBySerie(ctx, a.serie, a);
  await insertMutationLog(supabase, {
    portal_email: portalEmail, agent_id: agentId, tool_name: toolName,
    serie: a.serie, table_row_index: result.ok ? result.table_row_index : null,
    before_state: result.ok ? result.before_state : null,
    after_state:  result.ok ? result.after_state  : {},
    patched_columns: result.ok ? result.patched_columns : [],
    metadata: null, ops_charged: 1,
    success: result.ok, error_code: result.ok ? null : result.code,
  });
  if (!result.ok) {
    if (result.code === 'cannot_compute_factor') {
      return { ok: false, error: `No hay costo_mx en la fila de la serie ${a.serie}. Pásame factor explícito o completa el costo primero con inv_agregar_equipo.`, code: result.code };
    }
    return { ok: false, error: `No encontré el equipo con serie ${a.serie}.`, code: 'serie_not_found' };
  }
  return {
    ok: true, serie: result.serie,
    folio_venta: result.folio_venta, precio_unitario_mx: result.precio_unitario_mx,
    factor_calculado: result.factor_calculado,
    message: `Venta registrada serie ${result.serie}: folio ${result.folio_venta}, precio ${result.precio_unitario_mx} MXN, factor ${result.factor_calculado}.`,
  };
}
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/tools/executor.ts src/lib/tools/__tests__/executor-inv-registrar-venta.test.ts
git commit -m "feat(inventory): handler inv_registrar_venta + fecha ISO guard + 4 tests"
```

---

## Task 13: Executor handler `inv_registrar_salida`

**Files:**
- Modify: `src/lib/tools/executor.ts`
- Test: `src/lib/tools/__tests__/executor-inv-registrar-salida.test.ts` (nuevo)

**Interfaces:**
- Consumes: `patchSalidaBySeries(ctx, series, {folio_hoja, cliente_nombre, vendedor_codigo?, fecha?, proyecto?}): Promise<PatchSalidaResult>` (de Task 7).

**Diferencia clave vs. tasks 9-12**: inserta UN mutation log row POR serie afectada (iterando sobre `result.mutations`), no un solo row global.

- [ ] **Step 1: Write failing test**

Create `src/lib/tools/__tests__/executor-inv-registrar-salida.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveInv:   vi.fn(),
  patchSalida:  vi.fn(),
  insertLog:    vi.fn(),
  refundOps:    vi.fn(),
}));

vi.mock('@/lib/inventory/adapter', () => ({
  resolveInventoryContext: mocks.resolveInv,
  patchSalidaBySeries:     mocks.patchSalida,
  insertMutationLog:       mocks.insertLog,
}));
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 1, limit: 100 })),
  refundOps:   mocks.refundOps,
}));

async function runTool(args: Record<string, unknown>) {
  const { executeAgentTool } = await import('@/lib/tools/executor');
  return executeAgentTool('inv_registrar_salida', args, {
    agentId: 'agent-1', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos', portalToken: 'tok',
    agent: { id: 'agent-1', features: { inventory_write_enabled: true } },
    supabase: {} as never, channel: 'chat',
  });
}

describe('executor inv_registrar_salida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveInv.mockResolvedValue({ portalEmail: 'camila@acproyectos.com', token: 't', config: {} });
  });

  it('happy multi-serie: 2 series → 2 rows en audit log + mensaje con conteo', async () => {
    mocks.patchSalida.mockResolvedValue({
      ok: true, folio_hoja: '4251',
      series_registradas: ['2616HA045921', '2617HA02401A'], series_not_found: [], conflicts: [],
      mutations: [
        { serie: '2616HA045921', table_row_index: 10, before_state: { ESTATUS: 'SEPARADO' }, after_state: { ESTATUS: 'ENTREGADO' }, patched_columns: ['ESTATUS'] },
        { serie: '2617HA02401A', table_row_index: 11, before_state: { ESTATUS: 'SEPARADO' }, after_state: { ESTATUS: 'ENTREGADO' }, patched_columns: ['ESTATUS'] },
      ],
      message: 'Hoja de salida 4251 registrada: 2 equipos entregados a Mauricio Guerra.',
    });
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'Mauricio Guerra', fecha: '2026-10-01', series: ['2616HA045921', '2617HA02401A'] });
    expect((r as any).ok).toBe(true);
    expect(mocks.insertLog).toHaveBeenCalledTimes(2);
    expect((r as any).message).toContain('2 equipos');
  });

  it('1 encontrada + 1 not_found → ok:true con ambos sets en el mensaje', async () => {
    mocks.patchSalida.mockResolvedValue({
      ok: true, folio_hoja: '4251',
      series_registradas: ['2616HA045921'], series_not_found: ['NO-EXISTE'], conflicts: [],
      mutations: [{ serie: '2616HA045921', table_row_index: 10, before_state: {}, after_state: {}, patched_columns: ['ESTATUS'] }],
      message: 'Hoja de salida 4251 registrada: 1 equipos entregados a X. Series no encontradas: NO-EXISTE.',
    });
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'X', fecha: '2026-10-01', series: ['2616HA045921', 'NO-EXISTE'] });
    expect((r as any).ok).toBe(true);
    expect((r as any).series_not_found).toEqual(['NO-EXISTE']);
    expect(mocks.insertLog).toHaveBeenCalledTimes(1);
  });

  it('fecha inválida (no ISO) → invalid_input + refund (Review Focus #4)', async () => {
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'X', fecha: '1 de octubre', series: ['X'] });
    expect((r as any).ok).toBe(false);
    expect((r as any).code).toBe('invalid_input');
    expect(mocks.refundOps).toHaveBeenCalled();
    expect(mocks.patchSalida).not.toHaveBeenCalled();
  });

  it('conflicts reportados en el mensaje sin abortar', async () => {
    mocks.patchSalida.mockResolvedValue({
      ok: true, folio_hoja: '4251',
      series_registradas: ['2616HA045921'], series_not_found: [], conflicts: ['serie 2616HA045921 ya estaba asignada a "Otro" (no sobre-escribí)'],
      mutations: [{ serie: '2616HA045921', table_row_index: 10, before_state: {}, after_state: {}, patched_columns: ['ESTATUS'], conflict: 'serie 2616HA045921 ya estaba asignada a "Otro"' }],
      message: 'Hoja de salida 4251 registrada: 1 equipos entregados.',
    });
    const r = await runTool({ folio_hoja: '4251', cliente_nombre: 'X', series: ['2616HA045921'] });
    expect((r as any).ok).toBe(true);
    expect((r as any).conflicts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Implement handler**

Dentro del bloque inv_ del executor:
```typescript
if (toolName === 'inv_registrar_salida') {
  const a = args as { folio_hoja: string; cliente_nombre: string; vendedor_codigo?: string; fecha?: string; series: string[]; proyecto?: string };
  if (a.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: invalid_date` });
    return { ok: false, error: `fecha debe ser YYYY-MM-DD; recibí "${a.fecha}"`, code: 'invalid_input' };
  }
  const { resolveInventoryContext, patchSalidaBySeries, insertMutationLog } = await import('@/lib/inventory/adapter');
  const ctx = await resolveInventoryContext(portalEmail, supabase, agentId);
  if ('error' in ctx) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: ${ctx.error}` });
    return { ok: false, error: ctx.message, code: ctx.error };
  }
  const result = await patchSalidaBySeries(ctx, a.series, a);
  if (!result.ok) {
    await refundOps(agentId, 1, { source: 'tool_execution', label: `Refund ${toolName}: ${result.code}` });
    return { ok: false, error: result.message, code: result.code };
  }
  for (const m of result.mutations) {
    await insertMutationLog(supabase, {
      portal_email: portalEmail, agent_id: agentId, tool_name: toolName,
      serie: m.serie, table_row_index: m.table_row_index,
      before_state: m.before_state, after_state: m.after_state,
      patched_columns: m.patched_columns,
      metadata: { folio_hoja: a.folio_hoja, cliente: a.cliente_nombre, proyecto: a.proyecto, conflict: m.conflict ?? null },
      ops_charged: 1, success: true, error_code: null,
    });
  }
  return { ok: true, ...result };
}
```

Commit: `feat(inventory): handler inv_registrar_salida multi-serie + mutation log por serie + 4 tests`

---

## Task 14: Feature flag en system prompt builder

**Files:**
- Create: `src/lib/portal/__tests__/inventory-write-flag.test.ts`
- Create: `src/lib/portal/inventory-write-flag.ts` (helper extraíble)
- Modify: `src/app/api/portal/[token]/agent-chat/route.ts` (usar helper después del pack filter)

**Interfaces:**
- Produces: `filterWriteToolsByFlag(tools: Anthropic.Tool[], features: Record<string, unknown>): Anthropic.Tool[]`. El route.ts del chat lo invoca inmediatamente después del pack filter. Testing como función pura evita montar el route completo.

- [ ] **Step 1: Write failing test**

Create `src/lib/portal/__tests__/inventory-write-flag.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { filterWriteToolsByFlag, INVENTORY_WRITE_TOOL_NAMES } from '../inventory-write-flag';

const dummyTool = (name: string) => ({ name, description: 'x', input_schema: { type: 'object' as const, properties: {}, required: [] } });

describe('filterWriteToolsByFlag', () => {
  it('flag=false → remueve las 5 writes del array', () => {
    const input = [
      ...INVENTORY_WRITE_TOOL_NAMES.map(dummyTool),
      dummyTool('inv_buscar_por_serie'),
      dummyTool('enviar_correo'),
    ];
    const result = filterWriteToolsByFlag(input, {});
    expect(result.map(t => t.name)).toEqual(['inv_buscar_por_serie', 'enviar_correo']);
  });

  it('flag=true → preserva las 5 writes', () => {
    const input = INVENTORY_WRITE_TOOL_NAMES.map(dummyTool);
    const result = filterWriteToolsByFlag(input, { inventory_write_enabled: true });
    expect(result).toHaveLength(5);
  });

  it('features null → trata como flag=false', () => {
    const input = [dummyTool('inv_agregar_equipo'), dummyTool('inv_buscar_por_serie')];
    const result = filterWriteToolsByFlag(input, null as never);
    expect(result.map(t => t.name)).toEqual(['inv_buscar_por_serie']);
  });

  it('flag no-boolean truthy ("yes") → trata como false (type-strict)', () => {
    const input = [dummyTool('inv_agregar_equipo')];
    const result = filterWriteToolsByFlag(input, { inventory_write_enabled: 'yes' as never });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/lib/portal/__tests__/inventory-write-flag.test.ts`
Expected: FAIL ("Cannot find module '../inventory-write-flag'").

- [ ] **Step 3: Implement helper**

Create `src/lib/portal/inventory-write-flag.ts`:

```typescript
import type Anthropic from '@anthropic-ai/sdk';

export const INVENTORY_WRITE_TOOL_NAMES = [
  'inv_agregar_equipo',
  'inv_actualizar_estatus',
  'inv_asignar_cliente',
  'inv_registrar_venta',
  'inv_registrar_salida',
] as const;

const WRITE_SET: ReadonlySet<string> = new Set(INVENTORY_WRITE_TOOL_NAMES);

export function filterWriteToolsByFlag(
  tools:    Anthropic.Tool[],
  features: Record<string, unknown> | null | undefined,
): Anthropic.Tool[] {
  const enabled = features?.inventory_write_enabled === true;
  if (enabled) return tools;
  return tools.filter(t => !WRITE_SET.has(t.name));
}
```

- [ ] **Step 4: Wire al route agent-chat**

En `src/app/api/portal/[token]/agent-chat/route.ts` después del pack filter (~línea 2183 según el archivo actual), antes de `const toolsListText = ...`:

```typescript
const { filterWriteToolsByFlag } = await import('@/lib/portal/inventory-write-flag');
const filtered = filterWriteToolsByFlag(sessionTools, agentFeatures as Record<string, unknown>);
sessionTools.length = 0;
sessionTools.push(...filtered);
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/lib/portal/__tests__/inventory-write-flag.test.ts`
Expected: PASS 4/4.

Run: `npx vitest run src/app/api/portal` (regresión del route)
Expected: todos pasan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/portal/inventory-write-flag.ts src/lib/portal/__tests__/inventory-write-flag.test.ts src/app/api/portal/\[token\]/agent-chat/route.ts
git commit -m "feat(inventory): feature flag inventory_write_enabled oculta writers del prompt + 4 tests"
```

---

## Task 15: Rollback script `_smoke/revert-inv-mutation.mjs`

**Files:**
- Create: `_smoke/revert-inv-mutation.mjs`
- Test: manual con un row de audit log sintético

- [ ] **Step 1: Write script**

```javascript
// Rollback de una mutación específica del audit log.
// Uso: node _smoke/revert-inv-mutation.mjs <mutation_id>
// Restaura before_state en Excel + inserta nueva row 'manual_revert' en audit.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const [,, MUTATION_ID] = process.argv;
if (!MUTATION_ID) { console.error('Uso: node _smoke/revert-inv-mutation.mjs <mutation_id>'); process.exit(1); }

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: m, error } = await sb.from('inventory_mutations_log').select('*').eq('id', MUTATION_ID).single();
if (error || !m) { console.error('no encontrado:', MUTATION_ID); process.exit(1); }
console.log('mutation:', JSON.stringify({ id: m.id, tool: m.tool_name, serie: m.serie, portal: m.portal_email, success: m.success }, null, 2));

if (!m.success) { console.error('la mutación no fue exitosa, no hay nada que revertir'); process.exit(1); }

// Importamos adapter dinámico — usa el mismo flow que el executor
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(m.portal_email, sb, m.agent_id);
if ('error' in ctx) { console.error('no pude resolver contexto:', ctx.message); process.exit(1); }

if (m.before_state === null && m.tool_name === 'inv_agregar_equipo') {
  console.error('TODO: implementar DELETE row por table_row_index (Graph deleteTableRow). Fuera de scope Fase 1; manual via Excel por ahora.');
  process.exit(1);
}

// patch cada columna del before_state
const headers = await adapter.GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
await adapter.GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
  for (const col of m.patched_columns ?? []) {
    const idx = headers.findIndex(h => String(h).trim().toUpperCase() === col.toUpperCase());
    if (idx < 0) { console.warn('columna no encontrada:', col); continue; }
    const value = m.before_state[col];
    const letter = String.fromCharCode(65 + idx); // simplificado para col ≤ 26
    const abs = m.table_row_index + 2;
    await adapter.GraphExcel.patchCell(session, ctx.config.sheets.historico.name, `${letter}${abs}`, value);
    console.log(`reverted ${col} → ${JSON.stringify(value)}`);
  }
});

await sb.from('inventory_mutations_log').insert({
  portal_email: m.portal_email, agent_id: m.agent_id, tool_name: 'manual_revert',
  serie: m.serie, table_row_index: m.table_row_index,
  before_state: m.after_state, after_state: m.before_state,
  patched_columns: m.patched_columns, metadata: { reverted_id: m.id },
  ops_charged: 0, success: true, error_code: null,
});
console.log('DONE. Audit row insertado con reverted_id =', m.id);
```

- [ ] **Step 2: Commit**

```bash
git add _smoke/revert-inv-mutation.mjs
git commit -m "feat(inventory): rollback script _smoke/revert-inv-mutation.mjs"
```

---

## Task 16: Smoke script `_smoke/inv-write-dryrun-ac.mjs`

**Files:**
- Create: `_smoke/inv-write-dryrun-ac.mjs`
- Modify: `src/lib/test-helpers/prod-guard.ts` (verificar que existe y tiene `assertNotProdOrAllowed`)

- [ ] **Step 1: Verify prod-guard exists**

```bash
grep -l "assertNotProdOrAllowed" src/lib/test-helpers/*.ts
```

Si no existe, créalo en `src/lib/test-helpers/prod-guard.ts`:
```typescript
export async function assertNotProdOrAllowed(): Promise<void> {
  if (process.env.ALLOW_PROD_SMOKE === 'true') return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (url.includes('supabase.co') && !url.includes('localhost')) {
    throw new Error('Prod Supabase detected. Set ALLOW_PROD_SMOKE=true to proceed.');
  }
}
```

- [ ] **Step 2: Write smoke script**

```javascript
// Smoke test: escribe celda scratch en Excel AC, verifica, revierte.
// Requiere ALLOW_PROD_SMOKE=true porque toca Excel real en SharePoint.
// Uso: ALLOW_PROD_SMOKE=true node _smoke/inv-write-dryrun-ac.mjs

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

if (process.env.ALLOW_PROD_SMOKE !== 'true') {
  console.error('Requiere ALLOW_PROD_SMOKE=true. Aborting.');
  process.exit(1);
}

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

// Lee primera serie real de Tabla6
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error('ctx err:', ctx); process.exit(1); }

const rows = await adapter.GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
const firstSerie = rows[0]?.values?.[2]; // serie column
if (!firstSerie) { console.error('No hay rows en Tabla6'); process.exit(1); }
console.log('Serie de prueba:', firstSerie);

// Dry-run: patch estatus → '__TEST__' y revierte
const beforeHit = await adapter.findRowIndexBySerie(ctx, String(firstSerie));
if (!beforeHit) { console.error('serie no encontrada'); process.exit(1); }
const estatusIdx = beforeHit.headersMap['ESTATUS'];
const estatusActual = beforeHit.row[estatusIdx];
console.log('Estatus actual:', estatusActual);

const r1 = await adapter.patchEstatusBySerie(ctx, String(firstSerie), '__TEST__');
console.log('Patch result:', JSON.stringify(r1, null, 2));

// Revertir
const r2 = await adapter.patchEstatusBySerie(ctx, String(firstSerie), String(estatusActual));
console.log('Revert result:', JSON.stringify(r2, null, 2));

const after = await adapter.findRowIndexBySerie(ctx, String(firstSerie));
if (String(after.row[estatusIdx]) !== String(estatusActual)) {
  console.error('CORRUPTION — estatus no quedó en original!');
  process.exit(1);
}
console.log('OK — smoke test passed. Excel intacto.');
```

- [ ] **Step 3: Run manual (con Nazre OK)**

```bash
ALLOW_PROD_SMOKE=true node _smoke/inv-write-dryrun-ac.mjs
```
Expected: imprime "OK — smoke test passed. Excel intacto."

- [ ] **Step 4: Commit**

```bash
git add _smoke/inv-write-dryrun-ac.mjs src/lib/test-helpers/prod-guard.ts
git commit -m "feat(inventory): smoke script dry-run write+revert para AC"
```

---

## Task 17: Final verification + agent_runs sanity

**Files:** ninguno modificado. Solo ejecutar y confirmar.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: 0.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run src/lib/inventory src/lib/tools src/app/api/portal`
Expected: todos pasan. ~105 tests (85 existentes + 20 nuevos de Fase 1).

- [ ] **Step 3: Lint touched files**

Run:
```bash
npx eslint \
  src/lib/inventory/adapter.ts \
  src/lib/inventory/__tests__/adapter-find-row.test.ts \
  src/lib/inventory/__tests__/adapter-writers.test.ts \
  src/lib/tools/executor.ts \
  src/lib/tools/schemas.ts \
  src/lib/tools/channel-mapping.ts \
  src/lib/vapi/sync.ts \
  src/app/api/portal/\[token\]/agent-chat/route.ts \
  _smoke/inv-write-dryrun-ac.mjs \
  _smoke/revert-inv-mutation.mjs
```
Expected: 0 errors (warnings pre-existentes OK).

- [ ] **Step 4: LLM logging check**

Run: `npm run check:llm-logging`
Expected: OK — 0 violaciones.

- [ ] **Step 5: Manual activación en AC (opcional d6/d7 del rollout del spec)**

Con Nazre OK:
```bash
node -e "
const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const {data:va} = await sb.from('voice_agents').select('features').eq('id','3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const next = { ...(va.features ?? {}), inventory_write_enabled: true };
  await sb.from('voice_agents').update({ features: next }).eq('id','3245bc1f-89e1-4949-bbed-71a18b05e344');
  console.log('Flag inventory_write_enabled=true activado para Nami.');
})();
"
```

- [ ] **Step 6: E2E prueba desde chat portal (Meet con Camila)**

Script manual:
1. Camila entra al portal → oficina → chat con Nami.
2. "Agrega equipo serie 2619TEST001, modelo TEST-123, tonelada 3, oc TEST-OC-1".
3. Verificar: Excel muestra la row + `agent_runs.tools_called` + `inventory_mutations_log` tiene 1 row success.
4. "Marca serie 2619TEST001 como SEPARADO".
5. Verificar: estatus cambió + audit log tiene row 2.
6. "Marca serie 2619TEST001 como ENTREGADO".
7. Verificar.
8. Rollback de prueba: `node _smoke/revert-inv-mutation.mjs <id del row 2>` → estatus vuelve a ALMACEN.
9. Cleanup: Camila/Nazre borra la row de test del Excel manualmente (DELETE row).

- [ ] **Step 7: Commit tag release**

```bash
git tag nami-fase1-shipped
git push origin nami-fase1-shipped
```

---

## Deliverable Summary

Al final de las 17 tareas:
- 1 migración + tabla nueva con RLS.
- 5 adapter helpers (`addEquipoRow`, `patchEstatusBySerie`, `patchClienteBySerie`, `patchVentaBySerie`, `patchSalidaBySeries`) + 1 helper movido (`findRowIndexBySerie`) + 1 helper interno (`insertMutationLog`).
- 5 Anthropic tool schemas + wire a channel-mapping + sync.ts.
- 5 executor handlers con audit log integrado.
- 1 feature flag per-agent + filter en system prompt builder.
- 2 smoke scripts (dry-run write/revert + rollback por mutation_id).
- ~45 tests nuevos (24 adapter + 5 schemas + 20 handlers).
- Camila operativa en portal con los 5 flows básicos del PPT.
