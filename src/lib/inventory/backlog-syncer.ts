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
  deleted:       number;   // Modo 'replace': filas que estaban en Excel pero NO en el PDF nuevo
  mode:          'upsert' | 'replace';
  errors:        Array<{ row_key: string; error: string }>;
}

export class BacklogSyncerError extends Error {
  constructor(message: string, public code: 'empty_parsed_in_replace') {
    super(message);
    this.name = 'BacklogSyncerError';
  }
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

export interface BacklogIndex {
  index:         Map<string, { rowNumber: number; values: unknown[] }>;
  /**
   * Mayor fila con CUALQUIER contenido (incluso si no es formato Nami
   * reconocible). Necesario para que `replace` mode blank-fillee hasta
   * el final real de datos — sin esto, una hoja con filas residuales de
   * otro formato queda con basura al final (bug detectado 2026-10-02 contra
   * BACKLOG humano de 47 filas de Camila).
   */
  maxContentRow: number;
}

/**
 * Lee la hoja BACKLOG actual y devuelve index por (OC_AC, LINE_NUMBER).
 * El rango leído es A{start_row}:H{start_row + 999} — suficiente para 1000
 * líneas de BACKLOG, muy por encima del volumen esperado (~45-200).
 *
 * Retorna también `maxContentRow` para que replace mode conozca el verdadero
 * fin de datos (incluyendo filas con formato no-Nami que `excelRowKey` descarta).
 */
export async function readBacklogIndex(
  ctx:    InventoryContext,
  config: BacklogSheetConfig,
): Promise<BacklogIndex> {
  const endRow  = config.start_row + 999;
  const address = `A${config.start_row}:H${endRow}`;
  const range   = await GraphExcel.readRange(ctx.token, ctx.config.location, config.name, address);
  const index   = new Map<string, { rowNumber: number; values: unknown[] }>();
  let maxContentRow = config.start_row - 1;
  for (let i = 0; i < range.values.length; i++) {
    const row = range.values[i];
    // Fila vacía si A..H están todas vacías
    const hasContent = row.some(v => v !== '' && v !== null && v !== undefined);
    if (!hasContent) continue;
    const absRow = config.start_row + i;
    if (absRow > maxContentRow) maxContentRow = absRow;
    const key = excelRowKey(row);
    if (key === '::') continue;  // formato no reconocido (basura o formato humano antiguo)
    index.set(key, { rowNumber: absRow, values: row });
  }
  return { index, maxContentRow };
}

/**
 * Compara dos filas (array de 8 valores) para decidir si hay cambios.
 * Normalizamos tipos antes de comparar (strings vs numbers que Excel puede
 * leer distinto).
 *
 * Las columnas C (FECHA REGISTRO, idx 2) y G (FECHA ENTREGA ESTIMADA, idx 6)
 * reciben normalización fecha-aware: Excel coerce fechas ISO escritas como
 * string ("2025-11-18") a serial numbers (45979) al leerlas de vuelta. Sin
 * esta normalización el syncer reportaba `updated=45` cada re-run del mismo
 * PDF (bug detectado en E2E 2026-10-02).
 */
const DATE_COL_INDEXES = new Set([2, 6]);

export function rowsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const normalize = DATE_COL_INDEXES.has(i) ? normalizeDateCell : normalizeCell;
    if (normalize(a[i]) !== normalize(b[i])) return false;
  }
  return true;
}

function normalizeCell(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

/**
 * Normaliza una celda que semánticamente es fecha. Si es string ISO (YYYY-MM-DD)
 * la deja así; si es un Excel serial en rango razonable de fechas lo convierte
 * a ISO. Fuera de rango o tipos inesperados cae al `normalizeCell` genérico.
 *
 * Rango 10000–80000 cubre ~1927–2119. Serials fuera de ahí no son fechas y se
 * tratan como strings/numbers normales — ver test "Excel serial fuera de rango".
 */
const EXCEL_DATE_MIN = 10000;
const EXCEL_DATE_MAX = 80000;
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);   // 1899-12-30, maneja Lotus 1900 leap bug

function normalizeDateCell(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v) && v >= EXCEL_DATE_MIN && v <= EXCEL_DATE_MAX) {
    const d = new Date(EXCEL_EPOCH_UTC_MS + Math.round(v) * 86400000);
    const y  = d.getUTCFullYear();
    const m  = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return normalizeCell(v);
}

/**
 * Sync de las filas parseadas a la hoja BACKLOG. Dos modos:
 *
 * - `mode: 'replace'` (DEFAULT, confirmado por Camila 2026-10-01): vacía las
 *   filas actuales del BACKLOG y escribe las parseadas desde cero. Semántica
 *   "mirror del PDF más reciente". Filas Excel que no están en el PDF nuevo
 *   se eliminan (visible en summary.deleted). Guard crítico: si parsedRows
 *   está vacío (parse falló), lanza `BacklogSyncerError('empty_parsed_in_replace')`
 *   SIN tocar la hoja — nunca borra BACKLOG basado en un parse malo.
 *
 * - `mode: 'upsert'`: merge inteligente. Preserva filas Excel que no están
 *   en el PDF. Útil si Camila agrega notas manuales a filas específicas y
 *   no quiere que se borren.
 *
 * `dryRun=true` (default): no escribe, solo devuelve el summary de qué haría.
 * Siempre agrupa escrituras en una sola sesión Excel.
 */
export async function syncBacklogRows(
  ctx:          InventoryContext,
  config:       BacklogSheetConfig,
  parsedRows:   BacklogRow[],
  options:      { dryRun?: boolean; mode?: 'upsert' | 'replace' } = {},
): Promise<SyncerSummary> {
  const dryRun = options.dryRun !== false;         // default true
  const mode   = options.mode ?? 'replace';        // default replace per Camila
  const summary: SyncerSummary = { total_parsed: parsedRows.length, added: 0, updated: 0, unchanged: 0, deleted: 0, mode, errors: [] };

  if (mode === 'replace' && parsedRows.length === 0) {
    throw new BacklogSyncerError(
      'Rechazo replace con parsedRows vacío — nunca borrar BACKLOG basado en un parse fallido.',
      'empty_parsed_in_replace',
    );
  }

  const { index: existingIndex, maxContentRow } = await readBacklogIndex(ctx, config);
  const parsedKeys    = new Set(parsedRows.map(rowKey));

  // Contadores: comparar parsed vs existing en ambos modos
  for (const r of parsedRows) {
    const key = rowKey(r);
    const existing = existingIndex.get(key);
    const newValues = rowToExcelValues(r);
    if (!existing)                              summary.added++;
    else if (!rowsEqual(existing.values, newValues)) summary.updated++;
    else                                        summary.unchanged++;
  }
  if (mode === 'replace') {
    // `deleted` cuenta filas RECONOCIDAS que no están en el PDF nuevo.
    for (const k of existingIndex.keys()) {
      if (!parsedKeys.has(k)) summary.deleted++;
    }
    // Y filas no-reconocidas que vamos a borrar también (ex. formato humano).
    const unrecognizedRows = maxContentRow >= config.start_row
      ? (maxContentRow - config.start_row + 1) - existingIndex.size
      : 0;
    summary.deleted += unrecognizedRows;
  }

  if (dryRun) return summary;

  if (mode === 'replace') {
    // Un solo patchRange atómico: todas las filas parseadas + fill blanco
    // para cubrir el rango que antes ocupaban las filas eliminadas.
    const parsedValues = parsedRows.map(rowToExcelValues);
    // `maxContentRow` incluye tanto filas reconocidas como no-reconocidas
    // (fix 2026-10-02: BACKLOG humano con formato distinto quedaba residual).
    const existingMaxRow = Math.max(maxContentRow, config.start_row - 1);
    const newMaxRow      = config.start_row + parsedValues.length - 1;
    const writeMaxRow    = Math.max(newMaxRow, existingMaxRow);
    const emptyRow: unknown[] = ['', '', '', '', '', '', '', ''];
    const allValues: unknown[][] = [];
    for (let i = 0; i <= writeMaxRow - config.start_row; i++) {
      allValues.push(parsedValues[i] ?? emptyRow);
    }
    const address = `A${config.start_row}:H${writeMaxRow}`;
    try {
      await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
        await GraphExcel.patchRange(ctx.token, session, config.name, address, allValues);
      });
    } catch (err) {
      summary.errors.push({ row_key: '*', error: err instanceof Error ? err.message : String(err) });
    }
    return summary;
  }

  // mode === 'upsert': iterar + patch/add
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
          nextAppendRow++;
        } else if (!rowsEqual(existing.values, newValues)) {
          const address = `A${existing.rowNumber}:H${existing.rowNumber}`;
          await GraphExcel.patchRange(ctx.token, session, config.name, address, [newValues]);
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
