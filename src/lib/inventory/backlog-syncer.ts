/**
 * Syncer para la hoja BACKLOG del Excel de Nami.
 *
 * Toma las filas parseadas del PDF TRANE y las upsertea en la hoja BACKLOG
 * del archivo configurado en `inventory_excel_config`. La hoja arranca en
 * `config.sheets.backlog.start_row` (default 5 — rows 1-4 son headers/notas
 * en el formato de AC) y tiene 8 columnas:
 *
 *   A: OC AC                     ← CUSTOMER PO NUMBER
 *   B: OC TRANE                  ← ORDER NUMBER
 *   C: FECHA REGISTRO            ← ORDERED DATE
 *   D: MODELO                    ← ITEM
 *   E: CANTIDAD                  ← QUANTITY
 *   F: ESTATUS TRANE             ← LINES STATUS
 *   G: FECHA ENTREGA ESTIMADA    ← SCHEDULE SHIP DATE
 *   H: NOTAS                     ← "L{line} · {warehouse} · USD {usd} · RES {reserved}"
 *
 * Upsert por clave compuesta `(OC_AC, LINE_NUMBER)`. Idempotente: re-correr
 * con el mismo PDF no genera cambios (unchanged++ en el summary).
 */

import type { BacklogRow } from './backlog-parser';
import type { InventoryContext } from './adapter';
import * as GraphExcel from './graph-excel';

export interface SyncerSummary {
  total_parsed:  number;
  added:         number;
  updated:       number;
  unchanged:     number;
  errors:        Array<{ row_key: string; error: string }>;
}

/** 8 columnas del BACKLOG Excel en el orden A..H. */
const BACKLOG_COLUMNS = ['OC AC', 'OC TRANE', 'FECHA REGISTRO', 'MODELO', 'CANTIDAD', 'ESTATUS TRANE', 'FECHA ENTREGA ESTIMADA', 'NOTAS'] as const;
const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export interface BacklogSheetConfig {
  name:       string;   // 'BACKLOG'
  start_row:  number;   // 5
}

/**
 * Construye la fila (array de 8 valores) para escribir al Excel desde un
 * BacklogRow + line_number embebido en NOTAS.
 */
export function rowToExcelValues(r: BacklogRow): unknown[] {
  const notas = [
    r.line_number     ? `L${r.line_number}` : null,
    r.warehouse       ? r.warehouse         : null,
    r.backlog_usd != null ? `USD ${r.backlog_usd.toFixed(2)}` : null,
    r.reserved    != null ? `RES ${r.reserved}` : null,
  ].filter(Boolean).join(' · ');
  return [
    r.customer_po_number ?? '',
    r.order_number       ?? '',
    r.ordered_date       ?? '',
    r.item               ?? '',
    r.quantity           ?? '',
    r.lines_status       ?? '',
    r.schedule_ship_date ?? '',
    notas,
  ];
}

/** Clave compuesta de upsert. */
export function rowKey(r: BacklogRow): string {
  return `${r.customer_po_number ?? ''}::${r.line_number ?? ''}`;
}

/** Extrae `(OC_AC, LINE_NUMBER)` desde una fila cruda del Excel (A..H). */
export function excelRowKey(excelRow: unknown[]): string {
  const po = String(excelRow[0] ?? '').trim();
  // NOTAS está en index 7, línea embebida como "L1.5 · ..." al inicio.
  const notas = String(excelRow[7] ?? '').trim();
  const match = notas.match(/^L([\d.]+)/);
  const line = match ? match[1] : '';
  return `${po}::${line}`;
}

/**
 * Lee la hoja BACKLOG actual y devuelve index por (OC_AC, LINE_NUMBER).
 * El rango leído es A{start_row}:H{start_row + 999} — suficiente para 1000
 * líneas de BACKLOG, muy por encima del volumen esperado (~45-200).
 */
export async function readBacklogIndex(
  ctx:    InventoryContext,
  config: BacklogSheetConfig,
): Promise<Map<string, { rowNumber: number; values: unknown[] }>> {
  const endRow  = config.start_row + 999;
  const address = `A${config.start_row}:H${endRow}`;
  const range   = await GraphExcel.readRange(ctx.token, ctx.config.location, config.name, address);
  const index   = new Map<string, { rowNumber: number; values: unknown[] }>();
  for (let i = 0; i < range.values.length; i++) {
    const row = range.values[i];
    // Fila vacía si A..H están todas vacías
    const hasContent = row.some(v => v !== '' && v !== null && v !== undefined);
    if (!hasContent) continue;
    const key = excelRowKey(row);
    if (key === '::') continue;  // basura
    index.set(key, { rowNumber: config.start_row + i, values: row });
  }
  return index;
}

/**
 * Compara dos filas (array de 8 valores) para decidir si hay cambios.
 * Normalizamos tipos antes de comparar (strings vs numbers que Excel puede
 * leer distinto).
 */
export function rowsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const na = normalizeCell(a[i]);
    const nb = normalizeCell(b[i]);
    if (na !== nb) return false;
  }
  return true;
}

function normalizeCell(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

/**
 * Upsert de las filas parseadas en la hoja BACKLOG. Agrupa escrituras en una
 * sesión Excel para minimizar round-trips.
 *
 * `dryRun=true` (default): no escribe, solo devuelve el summary de qué haría.
 */
export async function syncBacklogRows(
  ctx:          InventoryContext,
  config:       BacklogSheetConfig,
  parsedRows:   BacklogRow[],
  options:      { dryRun?: boolean } = {},
): Promise<SyncerSummary> {
  const dryRun  = options.dryRun !== false;   // default true
  const summary: SyncerSummary = { total_parsed: parsedRows.length, added: 0, updated: 0, unchanged: 0, errors: [] };

  const existingIndex = await readBacklogIndex(ctx, config);

  // Si dryRun: contamos sin escribir
  if (dryRun) {
    let nextAppendRow = computeNextAppendRow(existingIndex, config);
    for (const r of parsedRows) {
      const key = rowKey(r);
      const existing = existingIndex.get(key);
      const newValues = rowToExcelValues(r);
      if (!existing) {
        summary.added++;
        nextAppendRow++;
      } else if (!rowsEqual(existing.values, newValues)) {
        summary.updated++;
      } else {
        summary.unchanged++;
      }
    }
    return summary;
  }

  // Modo write: una sesión para todas las escrituras
  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    let nextAppendRow = computeNextAppendRow(existingIndex, config);
    for (const r of parsedRows) {
      const key = rowKey(r);
      const existing = existingIndex.get(key);
      const newValues = rowToExcelValues(r);
      try {
        if (!existing) {
          const address = `A${nextAppendRow}:H${nextAppendRow}`;
          await GraphExcel.patchRange(ctx.token, session, config.name, address, [newValues]);
          summary.added++;
          nextAppendRow++;
        } else if (!rowsEqual(existing.values, newValues)) {
          const address = `A${existing.rowNumber}:H${existing.rowNumber}`;
          await GraphExcel.patchRange(ctx.token, session, config.name, address, [newValues]);
          summary.updated++;
        } else {
          summary.unchanged++;
        }
      } catch (err) {
        summary.errors.push({ row_key: key, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  return summary;
}

function computeNextAppendRow(
  index:  Map<string, { rowNumber: number; values: unknown[] }>,
  config: BacklogSheetConfig,
): number {
  let maxRow = config.start_row - 1;
  for (const { rowNumber } of index.values()) {
    if (rowNumber > maxRow) maxRow = rowNumber;
  }
  return maxRow + 1;
}
