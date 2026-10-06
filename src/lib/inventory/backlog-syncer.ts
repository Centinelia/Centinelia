/**
 * Syncer para la hoja BACKLOG del Excel de Nami.
 *
 * Dos modos de operación:
 *
 * 1. HEADER-DRIVEN (preferido 2026-10-06+): si el Excel tiene fila header con
 *    nombres canónicos ("CUSTOMER PO NUMBER", "ORDER NUMBER", ...), el syncer
 *    detecta las columnas por su nombre y escribe cada campo del PDF a su
 *    columna REAL (que puede estar en A, C, M, etc. según el layout del
 *    cliente). Preserva columnas que no estén en el mapping (si el cliente
 *    agregó notas custom al final).
 *
 * 2. LEGACY A-H (filas 1-4 son notas, header en row 4): comportamiento
 *    anterior donde las 8 columnas canónicas se escribían en A..H con un
 *    mapeo fijo. Se mantiene solo si readBacklogIndex no logra encontrar un
 *    header canónico en el rango esperado (fallback para tests + configs
 *    viejos). Las 7 columnas extra que el parser extrae (ACCOUNT MANAGER,
 *    ORDERED DATE, LINE NUMBER, etc.) se concatenan en la columna H "NOTAS".
 *
 * Upsert por clave compuesta `(OC_AC, LINE_NUMBER)`. Idempotente: re-correr
 * con el mismo PDF no genera cambios (unchanged++ en el summary).
 *
 * Audit 2026-10-06: antes el syncer asumía A-H y en AC Proyectos (que tiene
 * 12 columnas en C-N) habría destruido ORDER NUMBER, ORDERED DATE, LINE
 * NUMBER, SCHEDULE SHIP DATE, ACCOUNT MANAGER del BACKLOG real. Refactor:
 * detectar columnas por header + preservar lo no mapeado.
 */

import type { BacklogRow } from './backlog-parser';
import type { InventoryContext } from './adapter';
import * as GraphExcel from './graph-excel';

export interface SyncerSummary {
  total_parsed:  number;
  added:         number;
  updated:       number;
  unchanged:     number;
  deleted:       number;
  mode:          'upsert' | 'replace';
  errors:        Array<{ row_key: string; error: string }>;
  columns_resolved?: string[];  // Debug: nombres de columnas lógicas detectadas
}

export class BacklogSyncerError extends Error {
  constructor(message: string, public code: 'empty_parsed_in_replace' | 'no_header_found') {
    super(message);
    this.name = 'BacklogSyncerError';
  }
}

/** Nombres de columnas lógicas que el syncer puede escribir. */
export type BacklogLogicalCol =
  | 'customer_po' | 'order_number' | 'ordered_date' | 'line_number'
  | 'item' | 'lines_status' | 'ship_date' | 'quantity'
  | 'backlog_usd' | 'reserved' | 'reserved_usd' | 'account_manager'
  | 'notas';

/**
 * Config opcional en `inventory_excel_config.columns_backlog`. Si no está, el
 * syncer intenta auto-detectar los headers canónicos de TRANE.
 */
export type BacklogColumnsConfig = Partial<Record<BacklogLogicalCol, string>>;

/** Patrones por default para auto-detectar headers (case-insensitive, trim). */
const HEADER_PATTERNS: Record<BacklogLogicalCol, RegExp[]> = {
  customer_po:     [/^CUSTOMER\s*PO\s*NUMBER$/i, /^PO\s*NUMBER$/i, /^OC\s*AC$/i],
  order_number:    [/^ORDER\s*NUMBER$/i, /^OC\s*TRANE$/i, /^TRANE\s*ORDER$/i],
  ordered_date:    [/^ORDERED\s*DATE$/i, /^ORDER\s*DATE$/i, /^FECHA\s*REGISTRO$/i],
  line_number:     [/^LINE\s*NUMBER$/i, /^LINEA$/i],
  item:            [/^ITEM$/i, /^MODELO$/i, /^PART\s*NUMBER$/i],
  lines_status:    [/^LINES?\s*STATUS$/i, /^STATUS$/i, /^ESTATUS\s*TRANE$/i],
  ship_date:       [/^SCHEDULE\s*SHIP\s*DATE$/i, /^SHIP\s*DATE$/i, /^FECHA\s*ENTREGA\s*ESTIMADA$/i],
  quantity:        [/^QUANTITY$/i, /^CANTIDAD$/i],
  backlog_usd:     [/^BACKLOG\s*USD$/i, /^BACKLOG$/i],
  reserved:        [/^RESERVED$/i, /^RESERVADO$/i],
  reserved_usd:    [/^RESERVED\s*BACKLOG\s*USD$/i, /^RESERVED\s*USD$/i],
  account_manager: [/^ACCOUNT\s*MANAGER$/i, /^VENDEDOR\s*TRANE$/i],
  notas:           [/^NOTAS$/i, /^NOTES$/i],
};

/** 8 columnas legacy del BACKLOG en el orden A..H (compat con configs viejos). */
const LEGACY_COLUMNS: BacklogLogicalCol[] = [
  'customer_po', 'order_number', 'ordered_date', 'item',
  'quantity', 'lines_status', 'ship_date', 'notas',
];
const LEGACY_HEADERS: Record<BacklogLogicalCol, string> = {
  customer_po: 'OC AC', order_number: 'OC TRANE', ordered_date: 'FECHA REGISTRO',
  line_number: '', item: 'MODELO', lines_status: 'ESTATUS TRANE',
  ship_date: 'FECHA ENTREGA ESTIMADA', quantity: 'CANTIDAD', backlog_usd: '',
  reserved: '', reserved_usd: '', account_manager: '', notas: 'NOTAS',
};

export interface BacklogSheetConfig {
  name:       string;
  start_row:  number;
  columns?:   BacklogColumnsConfig;
}

export interface ResolvedColumns {
  headerRowNumber:   number;             // Excel row 1-based del header
  dataStartRow:      number;             // Primera fila con datos
  colIndex:          Partial<Record<BacklogLogicalCol, number>>;  // logical → sheet col index 0-based
  firstDataCol:      number;             // Primera col 0-based con datos (menor de colIndex)
  lastDataCol:       number;             // Última col 0-based con datos (mayor de colIndex)
  usingLegacyLayout: boolean;            // true si no detectó header canónico
}

/**
 * Resuelve dónde están las columnas lógicas en el sheet. Prioriza:
 *   1. Config `columns_backlog` (nombres explícitos del cliente)
 *   2. Patrones canónicos (CUSTOMER PO NUMBER, etc.) buscados en el header row
 *   3. Fallback LEGACY: A..H con start_row-1 como header
 *
 * Lee rango amplio A1:Z{start_row + N} para encontrar el header.
 */
export async function resolveColumns(
  ctx:    InventoryContext,
  config: BacklogSheetConfig,
): Promise<ResolvedColumns> {
  const customColumns = config.columns ?? ((ctx.config as unknown as { columns_backlog?: BacklogColumnsConfig }).columns_backlog ?? {});
  // Lee top del BACKLOG para buscar el header
  const topEnd = config.start_row + 10;
  const range = await GraphExcel.readRange(ctx.token, ctx.config.location, config.name, `A1:Z${topEnd}`);
  let headerRowIdx = -1;
  let headerRow: unknown[] = [];
  for (let i = 0; i < range.values.length; i++) {
    const row = range.values[i];
    const hasCustomerPo = row.some(v =>
      HEADER_PATTERNS.customer_po.some(re => re.test(String(v ?? '').trim()))
    );
    if (hasCustomerPo) {
      headerRowIdx = i;
      headerRow = row;
      break;
    }
  }
  if (headerRowIdx < 0) {
    // Fallback LEGACY: asume header en start_row - 1 con layout A..H.
    const colIndex: Partial<Record<BacklogLogicalCol, number>> = {};
    LEGACY_COLUMNS.forEach((logical, i) => { colIndex[logical] = i; });
    return {
      headerRowNumber:   config.start_row - 1,
      dataStartRow:      config.start_row,
      colIndex,
      firstDataCol:      0,
      lastDataCol:       7,
      usingLegacyLayout: true,
    };
  }
  const headerRowNumber = headerRowIdx + 1;
  const dataStartRow = headerRowNumber + 1;
  const colIndex: Partial<Record<BacklogLogicalCol, number>> = {};
  const normalizedHeaders = headerRow.map(v => String(v ?? '').trim());
  // Mapear cada campo lógico
  for (const logical of Object.keys(HEADER_PATTERNS) as BacklogLogicalCol[]) {
    const customName = customColumns[logical];
    const patterns = customName
      ? [new RegExp(`^${customName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')]
      : HEADER_PATTERNS[logical];
    const idx = normalizedHeaders.findIndex(h => h && patterns.some(re => re.test(h)));
    if (idx >= 0) colIndex[logical] = idx;
  }
  const positions = Object.values(colIndex).filter((v): v is number => typeof v === 'number');
  if (positions.length === 0) {
    throw new BacklogSyncerError('Header detectado pero no se mapeó ninguna columna conocida', 'no_header_found');
  }
  return {
    headerRowNumber,
    dataStartRow,
    colIndex,
    firstDataCol:      Math.min(...positions),
    lastDataCol:       Math.max(...positions),
    usingLegacyLayout: false,
  };
}

/**
 * Clave compuesta de upsert. Default: `po::line`. Si `resolved` indica que el
 * Excel NO tiene columna LINE NUMBER, cae a `po::item:MODELO` para evitar
 * colapsar múltiples líneas de la misma OC al mismo key (fix 2026-10-06
 * cuando descubrimos que AC Proyectos REAL solo tiene 7 columnas, sin LINE
 * NUMBER — con el default `po::line` el syncer colapsaba 47 filas Excel a 15
 * keys y mode=upsert nunca matcheaba, haciendo que cada corrida duplicara).
 */
export function rowKey(r: BacklogRow, resolved?: ResolvedColumns): string {
  const po = r.customer_po_number ?? '';
  if (!resolved || resolved.colIndex.line_number != null) {
    return `${po}::${r.line_number ?? ''}`;
  }
  return `${po}::item:${r.item ?? ''}`;
}

/**
 * Extrae `(customer_po, line_number)` de una fila Excel usando el mapping
 * resuelto. En modo legacy la línea viene embebida en NOTAS como "L1.5 · ...".
 */
export function excelRowKey(excelRow: unknown[], resolved?: ResolvedColumns): string {
  // Fallback legacy (sin resolved): asume PO en col 0, line embebido en NOTAS idx 7.
  // Mantener para backward compat con tests y configs que no pasan por resolveColumns.
  if (!resolved) {
    const po = String(excelRow[0] ?? '').trim();
    if (!po) return '::';
    const notas = String(excelRow[7] ?? '').trim();
    const match = notas.match(/^L([\d.]+)/);
    const line = match ? match[1] : '';
    return `${po}::${line}`;
  }
  const poIdx = resolved.colIndex.customer_po;
  if (poIdx == null) return '::';
  const po = String(excelRow[poIdx] ?? '').trim();
  if (!po) return '::';
  const lineIdx = resolved.colIndex.line_number;
  if (lineIdx != null) {
    const line = String(excelRow[lineIdx] ?? '').trim();
    return `${po}::${line}`;
  }
  // Sin LINE NUMBER: fallback a item (consistente con rowKey del PDF)
  const itemIdx = resolved.colIndex.item;
  if (itemIdx != null) {
    const item = String(excelRow[itemIdx] ?? '').trim();
    return `${po}::item:${item}`;
  }
  // Legacy fallback: línea embebida en NOTAS
  if (resolved.usingLegacyLayout) {
    const notasIdx = resolved.colIndex.notas;
    if (notasIdx != null) {
      const notas = String(excelRow[notasIdx] ?? '').trim();
      const match = notas.match(/^L([\d.]+)/);
      if (match) return `${po}::${match[1]}`;
    }
  }
  return `${po}::`;
}

/**
 * Devuelve un Map<columnIndex, value> con los valores que el syncer va a
 * escribir para una fila. En modo LEGACY, también incluye el campo NOTAS
 * sintético con los extras concatenados.
 */
export function rowToColumnValues(r: BacklogRow, resolved: ResolvedColumns): Map<number, unknown> {
  const result = new Map<number, unknown>();
  const put = (logical: BacklogLogicalCol, value: unknown) => {
    const idx = resolved.colIndex[logical];
    if (idx != null) result.set(idx, value ?? '');
  };
  put('customer_po',      r.customer_po_number);
  put('order_number',     r.order_number);
  put('ordered_date',     r.ordered_date);
  put('line_number',      r.line_number);
  put('item',             r.item);
  put('lines_status',     r.lines_status);
  put('ship_date',        r.schedule_ship_date);
  put('quantity',         r.quantity);
  put('backlog_usd',      r.backlog_usd);
  put('reserved',         r.reserved);
  put('reserved_usd',     r.reserved_backlog_usd);
  put('account_manager',  r.account_manager);

  if (resolved.usingLegacyLayout) {
    // NOTAS concatena los campos que no tienen columna propia en el layout legacy
    const notas = [
      r.line_number     ? `L${r.line_number}` : null,
      r.warehouse       ? r.warehouse         : null,
      r.backlog_usd != null ? `USD ${r.backlog_usd.toFixed(2)}` : null,
      r.reserved    != null ? `RES ${r.reserved}` : null,
    ].filter(Boolean).join(' · ');
    put('notas', notas);
  }
  return result;
}

/**
 * Compat con el syncer viejo: solo para los unit tests existentes que esperan
 * un array de 8 valores en orden A..H. Nuevo código debería usar rowToColumnValues.
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

export interface BacklogIndex {
  index:         Map<string, { rowNumber: number; values: unknown[] }>;
  maxContentRow: number;
  resolved:      ResolvedColumns;
}

export async function readBacklogIndex(
  ctx:    InventoryContext,
  config: BacklogSheetConfig,
): Promise<BacklogIndex> {
  const resolved = await resolveColumns(ctx, config);
  const endRow   = resolved.dataStartRow + 999;
  // Leemos desde columna A hasta la última mapeada (+ margen por si hay basura
  // a la derecha). Preserva las no mapeadas intactas al re-leer.
  const lastColLetter = colIndexToLetter(resolved.lastDataCol);
  const address = `A${resolved.dataStartRow}:${lastColLetter}${endRow}`;
  const range = await GraphExcel.readRange(ctx.token, ctx.config.location, config.name, address);
  const index = new Map<string, { rowNumber: number; values: unknown[] }>();
  let maxContentRow = resolved.dataStartRow - 1;
  for (let i = 0; i < range.values.length; i++) {
    const row = range.values[i];
    const hasContent = row.some(v => v !== '' && v !== null && v !== undefined);
    if (!hasContent) continue;
    const absRow = resolved.dataStartRow + i;
    if (absRow > maxContentRow) maxContentRow = absRow;
    const key = excelRowKey(row, resolved);
    if (key === '::') continue;
    index.set(key, { rowNumber: absRow, values: row });
  }
  return { index, maxContentRow, resolved };
}

function colIndexToLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Normalización fecha-aware para comparar strings vs numbers en celdas fecha. */
const EXCEL_DATE_MIN = 10000;
const EXCEL_DATE_MAX = 80000;
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

function normalizeCell(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  // Si viene con formato currency ($1,234.56 → 1234.56), normalizar a número
  // para comparar contra el valor que el syncer escribió como number.
  const moneyMatch = s.match(/^\$?\s*-?[\d,]+(\.\d+)?$/);
  if (moneyMatch) {
    const num = Number(s.replace(/[$,\s]/g, ''));
    if (Number.isFinite(num)) return String(num);
  }
  return s;
}

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
 * Compara dos filas con normalización fecha-aware. Las columnas fecha vienen
 * del colIndex (ordered_date, ship_date). En legacy A..H los índices son 2 y 6.
 */
export function rowsEqualResolved(a: unknown[], b: unknown[], resolved: ResolvedColumns): boolean {
  if (a.length !== b.length) return false;
  const dateIdxs = new Set<number>();
  if (resolved.colIndex.ordered_date != null) dateIdxs.add(resolved.colIndex.ordered_date);
  if (resolved.colIndex.ship_date != null) dateIdxs.add(resolved.colIndex.ship_date);
  for (let i = 0; i < a.length; i++) {
    const norm = dateIdxs.has(i) ? normalizeDateCell : normalizeCell;
    if (norm(a[i]) !== norm(b[i])) return false;
  }
  return true;
}

/** Legacy helper para tests. */
export function rowsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const DATE_COL_INDEXES = new Set([2, 6]);
  for (let i = 0; i < a.length; i++) {
    const norm = DATE_COL_INDEXES.has(i) ? normalizeDateCell : normalizeCell;
    if (norm(a[i]) !== norm(b[i])) return false;
  }
  return true;
}

export async function syncBacklogRows(
  ctx:          InventoryContext,
  config:       BacklogSheetConfig,
  parsedRows:   BacklogRow[],
  options:      { dryRun?: boolean; mode?: 'upsert' | 'replace' } = {},
): Promise<SyncerSummary> {
  const dryRun = options.dryRun !== false;
  const mode   = options.mode ?? 'upsert';
  const summary: SyncerSummary = { total_parsed: parsedRows.length, added: 0, updated: 0, unchanged: 0, deleted: 0, mode, errors: [] };

  if (mode === 'replace' && parsedRows.length === 0) {
    throw new BacklogSyncerError(
      'Rechazo replace con parsedRows vacío — nunca borrar BACKLOG basado en un parse fallido.',
      'empty_parsed_in_replace',
    );
  }

  const { index: existingIndex, maxContentRow, resolved } = await readBacklogIndex(ctx, config);
  summary.columns_resolved = Object.keys(resolved.colIndex);
  const parsedKeys = new Set(parsedRows.map(r => rowKey(r, resolved)));

  // Contadores (compare parsed vs existing según el mapping real)
  const rangeWidth = resolved.lastDataCol - resolved.firstDataCol + 1;
  for (const r of parsedRows) {
    const key = rowKey(r, resolved);
    const existing = existingIndex.get(key);
    const newRow = buildRowForResolvedWidth(r, resolved, rangeWidth, existing?.values);
    if (!existing)                                             summary.added++;
    else if (!rowsEqualResolved(existing.values, newRow, resolved)) summary.updated++;
    else                                                       summary.unchanged++;
  }
  if (mode === 'replace') {
    for (const k of existingIndex.keys()) {
      if (!parsedKeys.has(k)) summary.deleted++;
    }
    const unrecognizedRows = maxContentRow >= resolved.dataStartRow
      ? (maxContentRow - resolved.dataStartRow + 1) - existingIndex.size
      : 0;
    summary.deleted += unrecognizedRows;
  }

  if (dryRun) return summary;

  const firstColLetter = colIndexToLetter(resolved.firstDataCol);
  const lastColLetter  = colIndexToLetter(resolved.lastDataCol);

  if (mode === 'replace') {
    // En replace: escribir en el rango [dataStartRow .. max(newLast, maxContentRow)].
    // Cada fila es un array de length rangeWidth. Para posiciones no mapeadas:
    //   - Si hay valor existente en esa posición, PRESERVARLO
    //   - Si no, dejar '' (vacío)
    // Para filas sobrantes (existentes no en PDF): escribir '' en TODO el rango
    // (incluyendo columnas no mapeadas) porque esa fila ya no debe existir.
    const newMaxRow = resolved.dataStartRow + parsedRows.length - 1;
    const writeMaxRow = Math.max(newMaxRow, maxContentRow);
    const allValues: unknown[][] = [];
    // Pre-fetchear las filas existentes del rango para preservar columnas no-mapeadas
    const existingRange = await GraphExcel.readRange(
      ctx.token, ctx.config.location, config.name,
      `${firstColLetter}${resolved.dataStartRow}:${lastColLetter}${writeMaxRow}`,
    );
    for (let i = 0; i <= writeMaxRow - resolved.dataStartRow; i++) {
      const parsedRow = parsedRows[i];
      const existingRow = existingRange.values[i] ?? [];
      if (parsedRow) {
        allValues.push(buildRowForResolvedWidth(parsedRow, resolved, rangeWidth, existingRow));
      } else {
        // Fila sobrante: vaciar completo (incluye no-mapeadas; replace semantics)
        allValues.push(new Array(rangeWidth).fill(''));
      }
    }
    try {
      await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
        const address = `${firstColLetter}${resolved.dataStartRow}:${lastColLetter}${writeMaxRow}`;
        await GraphExcel.patchRange(ctx.token, session, config.name, address, allValues);
      });
    } catch (err) {
      summary.errors.push({ row_key: '*', error: err instanceof Error ? err.message : String(err) });
    }
    return summary;
  }

  // UPSERT: iterar fila por fila
  await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
    let nextAppendRow = computeNextAppendRow(existingIndex, resolved);
    for (const r of parsedRows) {
      const key = rowKey(r, resolved);
      const existing = existingIndex.get(key);
      const newRow = buildRowForResolvedWidth(r, resolved, rangeWidth, existing?.values);
      try {
        if (!existing) {
          const address = `${firstColLetter}${nextAppendRow}:${lastColLetter}${nextAppendRow}`;
          await GraphExcel.patchRange(ctx.token, session, config.name, address, [newRow]);
          nextAppendRow++;
        } else if (!rowsEqualResolved(existing.values, newRow, resolved)) {
          const address = `${firstColLetter}${existing.rowNumber}:${lastColLetter}${existing.rowNumber}`;
          await GraphExcel.patchRange(ctx.token, session, config.name, address, [newRow]);
        }
      } catch (err) {
        summary.errors.push({ row_key: key, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  return summary;
}

/**
 * Construye el array de valores de una fila sincronizada, de ancho = rangeWidth.
 * Si existing viene provisto, preserva las columnas no-mapeadas de ese array
 * (importante para mode=upsert y para no destruir custom columns del cliente).
 */
function buildRowForResolvedWidth(
  r:          BacklogRow,
  resolved:   ResolvedColumns,
  rangeWidth: number,
  existing?:  unknown[],
): unknown[] {
  const cells = rowToColumnValues(r, resolved);
  const row = new Array(rangeWidth).fill('');
  // Rellenar primero con existing (preserva lo que no vamos a tocar)
  if (existing) {
    for (let i = 0; i < rangeWidth; i++) {
      row[i] = existing[i] ?? '';
    }
  }
  // Luego override con los valores mapeados (offset al firstDataCol porque el
  // rangeWidth empieza en firstDataCol).
  for (const [absIdx, value] of cells) {
    const localIdx = absIdx - resolved.firstDataCol;
    if (localIdx >= 0 && localIdx < rangeWidth) row[localIdx] = value;
  }
  return row;
}

function computeNextAppendRow(
  index:    Map<string, { rowNumber: number; values: unknown[] }>,
  resolved: ResolvedColumns,
): number {
  let maxRow = resolved.dataStartRow - 1;
  for (const { rowNumber } of index.values()) {
    if (rowNumber > maxRow) maxRow = rowNumber;
  }
  return maxRow + 1;
}
