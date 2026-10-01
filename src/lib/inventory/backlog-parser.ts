/**
 * Parser determinístico del PDF BACKLOG de TRANE para AC Proyectos.
 *
 * El PDF llega automatizado de `no-reply@tranetechnologies.com` encriptado con
 * password compartida por el cliente (guardada en
 * organizations.inventory_excel_config.backlog_trane.pdf_password). Tiene una
 * tabla fija de 15 columnas documentada en memoria
 * [[project-ac-backlog-trane-schema]].
 *
 * El parser:
 *   1. Descifra el PDF con la password dada.
 *   2. Extrae los text items posicionados (x, y) de la página 1.
 *   3. Agrupa items por Y (tolerancia pequeña para variaciones de baseline).
 *   4. Identifica la fila de headers por la presencia de "ORDER TYPE".
 *   5. Captura las X iniciales de cada header como límites de columna.
 *   6. Para cada fila de datos (Y menor al header), asigna cada item a su
 *      columna por X y concatena si hay múltiples items en la misma columna.
 *   7. Parsea strings crudos a tipos (números, fechas) con validación
 *      estricta — si algo no parsea, el campo queda null y se registra en
 *      `parse_errors` por fila. No se tira la fila entera por un campo malo.
 *
 * Sin LLM. Testeable sin PDF real vía mock del output de pdfjs.
 */

export interface BacklogRow {
  order_type:              string | null;
  customer_po_number:      string | null;  // OC AC
  order_number:            string | null;  // Folio TRANE
  project:                 string | null;
  ordered_date:            string | null;  // YYYY-MM-DD
  line_number:             string | null;  // '1.5', '2.1', etc.
  item:                    string | null;  // Modelo TRANE
  lines_status:            string | null;  // AWAITING_SHIPPING, etc.
  warehouse:               string | null;
  schedule_ship_date:      string | null;  // YYYY-MM-DD
  quantity:                number | null;
  backlog_usd:             number | null;
  reserved:                number | null;
  reserved_backlog_usd:    number | null;
  account_manager:         string | null;
  parse_errors:            string[];
}

export interface BacklogParseResult {
  rows:         BacklogRow[];
  page_count:   number;
  file_name?:   string;
  parsed_at:    string;   // ISO
}

export class BacklogParseError extends Error {
  constructor(message: string, public code: 'bad_password' | 'no_header_row' | 'empty_pdf' | 'pdf_load_failed') {
    super(message);
    this.name = 'BacklogParseError';
  }
}

interface PdfTextItem {
  str:        string;
  transform:  [number, number, number, number, number, number];  // last 2 = x, y
  width:      number;
}

/** Encabezados esperados del PDF TRANE (orden fijo verificado 2026-09-30). */
const EXPECTED_HEADERS = [
  'ORDER TYPE',
  'CUSTOMER PO NUMBER',
  'ORDER NUMBER',
  'PROJECT',
  'ORDERED DATE',
  'LINE NUMBER',
  'ITEM',
  'LINES STATUS',
  'WAREHOUSE',
  'SCHEDULE SHIP DATE',
  'QUANTITY',
  'BACKLOG USD',
  'RESERVED',
  'RESERVED BACKLOG USD',
  'ACCOUNT MANAGER',
] as const;

const Y_TOLERANCE = 3;  // same-row items diffieren ≤3 unidades de Y

/**
 * Agrupa items por su Y (dentro de tolerancia Y_TOLERANCE), devuelve clusters
 * ordenados por Y descendente (header arriba, filas de datos abajo).
 */
export function groupItemsByRow(items: PdfTextItem[]): PdfTextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  const rows: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [sorted[0]];
  let currentY = sorted[0].transform[5];
  for (let i = 1; i < sorted.length; i++) {
    const y = sorted[i].transform[5];
    if (Math.abs(y - currentY) <= Y_TOLERANCE) {
      current.push(sorted[i]);
    } else {
      rows.push(current.sort((a, b) => a.transform[4] - b.transform[4]));
      current = [sorted[i]];
      currentY = y;
    }
  }
  rows.push(current.sort((a, b) => a.transform[4] - b.transform[4]));
  return rows;
}

/**
 * Dada la fila de headers (ya ordenada por X), devuelve los límites de columna
 * como [xStart, xEnd) para cada header en orden. La última columna termina en
 * Infinity. La primera comienza en 0 (los datos pueden empezar a la izquierda
 * del header text — ej. header "ORDER TYPE" centrado en x=127, dato
 * "Standard Order MX" left-aligned en x=116). Items con str de solo espacios
 * o width 0 se ignoran.
 *
 * Los boundaries de columna son el **midpoint entre starts de headers
 * consecutivos** (NO el start del header mismo), para capturar datos que
 * caen en el "gap visual" entre headers.
 */
export function headerColumns(headerRow: PdfTextItem[]): Array<{ name: string; xStart: number; xEnd: number }> {
  const meaningful = headerRow.filter(it => it.str.trim().length > 0 && it.width > 0);
  const starts: Array<{ name: string; x: number }> = [];
  // Los headers pueden venir como múltiples items (ej. "ORDER" "TYPE") si pdfjs
  // los divide. Reconstruimos concatenando items consecutivos hasta que
  // coincidan con uno de EXPECTED_HEADERS.
  let i = 0;
  while (i < meaningful.length) {
    let combined = meaningful[i].str.trim();
    const start = meaningful[i].transform[4];
    let j = i + 1;
    while (j < meaningful.length && !EXPECTED_HEADERS.some(h => h === combined)) {
      combined = (combined + ' ' + meaningful[j].str.trim()).trim();
      j++;
    }
    if (EXPECTED_HEADERS.some(h => h === combined)) {
      starts.push({ name: combined, x: start });
      i = j;
    } else {
      i++;
    }
  }
  const result: Array<{ name: string; xStart: number; xEnd: number }> = [];
  for (let k = 0; k < starts.length; k++) {
    // Primera columna: desde 0 (datos pueden left-alignarse antes del header).
    // Última: hasta Infinity.
    // Resto: midpoint entre header anterior y actual (inicio), midpoint entre
    // actual y siguiente (fin). Esto captura datos que caen en el gap visual.
    const xStart = k === 0 ? 0 : (starts[k - 1].x + starts[k].x) / 2;
    const xEnd   = k === starts.length - 1 ? Number.POSITIVE_INFINITY : (starts[k].x + starts[k + 1].x) / 2;
    result.push({ name: starts[k].name, xStart, xEnd });
  }
  return result;
}

/**
 * Para una fila de datos y los límites de columna, devuelve un objeto
 * { headerName: concatenated-string-of-items-in-that-column }.
 */
export function assignRowToColumns(
  dataRow: PdfTextItem[],
  columns: Array<{ name: string; xStart: number; xEnd: number }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const col of columns) result[col.name] = '';
  for (const it of dataRow) {
    const s = it.str.trim();
    if (!s) continue;
    const x = it.transform[4];
    const col = columns.find(c => x >= c.xStart && x < c.xEnd);
    if (!col) continue;
    result[col.name] = result[col.name] ? (result[col.name] + ' ' + s).trim() : s;
  }
  return result;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseMoneyUsd(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseInt10(raw: string): number | null {
  const cleaned = raw.trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Mapea un dict crudo de header→valor a BacklogRow tipado con validación.
 */
export function mapColumnsToRow(cols: Record<string, string>): BacklogRow {
  const errors: string[] = [];
  const row: BacklogRow = {
    order_type:            cols['ORDER TYPE']            || null,
    customer_po_number:    cols['CUSTOMER PO NUMBER']    || null,
    order_number:          cols['ORDER NUMBER']          || null,
    project:               cols['PROJECT']               || null,
    ordered_date:          null,
    line_number:           cols['LINE NUMBER']           || null,
    item:                  cols['ITEM']                  || null,
    lines_status:          cols['LINES STATUS']          || null,
    warehouse:             cols['WAREHOUSE']             || null,
    schedule_ship_date:    null,
    quantity:              null,
    backlog_usd:           null,
    reserved:              null,
    reserved_backlog_usd:  null,
    account_manager:       cols['ACCOUNT MANAGER']       || null,
    parse_errors:          errors,
  };

  if (cols['ORDERED DATE']) {
    if (ISO_DATE.test(cols['ORDERED DATE'])) row.ordered_date = cols['ORDERED DATE'];
    else errors.push(`ordered_date: formato inválido "${cols['ORDERED DATE']}"`);
  }
  if (cols['SCHEDULE SHIP DATE']) {
    if (ISO_DATE.test(cols['SCHEDULE SHIP DATE'])) row.schedule_ship_date = cols['SCHEDULE SHIP DATE'];
    else errors.push(`schedule_ship_date: formato inválido "${cols['SCHEDULE SHIP DATE']}"`);
  }
  if (cols['QUANTITY']) {
    const n = parseInt10(cols['QUANTITY']);
    if (n != null) row.quantity = n; else errors.push(`quantity: no es entero "${cols['QUANTITY']}"`);
  }
  if (cols['RESERVED']) {
    const n = parseInt10(cols['RESERVED']);
    if (n != null) row.reserved = n; else errors.push(`reserved: no es entero "${cols['RESERVED']}"`);
  }
  if (cols['BACKLOG USD']) {
    const n = parseMoneyUsd(cols['BACKLOG USD']);
    if (n != null) row.backlog_usd = n; else errors.push(`backlog_usd: no es monto "${cols['BACKLOG USD']}"`);
  }
  if (cols['RESERVED BACKLOG USD']) {
    const n = parseMoneyUsd(cols['RESERVED BACKLOG USD']);
    if (n != null) row.reserved_backlog_usd = n; else errors.push(`reserved_backlog_usd: no es monto "${cols['RESERVED BACKLOG USD']}"`);
  }

  return row;
}

/**
 * Parser principal: recibe los items posicionados ya extraídos del PDF
 * (contrato con pdfjs/unpdf aislado para testeabilidad), devuelve el schema.
 *
 * Para parsing real desde un Uint8Array del PDF, usar `parseBacklogPdf()`
 * abajo que encapsula el pipeline completo.
 */
export function parseBacklogItems(items: PdfTextItem[]): BacklogRow[] {
  const rows = groupItemsByRow(items);
  const headerIdx = rows.findIndex(r => r.some(it => it.str.trim() === 'ORDER TYPE'));
  if (headerIdx < 0) throw new BacklogParseError('No se encontró fila de headers con ORDER TYPE', 'no_header_row');
  const cols = headerColumns(rows[headerIdx]);
  const dataRows = rows.slice(headerIdx + 1);
  const parsed: BacklogRow[] = [];
  for (const r of dataRows) {
    // Fila vacía o fila de totales/footer (ej. "Page 1" en el footer que ya
    // separamos arriba): filtrar si no tiene nada en las primeras 3 columnas.
    const assigned = assignRowToColumns(r, cols);
    const hasOrderType = !!assigned['ORDER TYPE'];
    const hasPo        = !!assigned['CUSTOMER PO NUMBER'];
    const hasOrderNum  = !!assigned['ORDER NUMBER'];
    if (!(hasOrderType && hasPo && hasOrderNum)) continue;
    parsed.push(mapColumnsToRow(assigned));
  }
  return parsed;
}

/**
 * Pipeline completo: descifra el PDF, extrae items, parsea.
 * Dependencias: `unpdf` (ya en node_modules) + `unpdf/pdfjs` resolver.
 */
export async function parseBacklogPdf(
  pdfBytes: Uint8Array,
  password: string,
): Promise<BacklogParseResult> {
  const unpdf  = await import('unpdf');
  const pdfjs  = await import('unpdf/pdfjs');
  await unpdf.configureUnPDF({ pdfjs: () => Promise.resolve(pdfjs) });

  let pdf: Awaited<ReturnType<typeof unpdf.getDocumentProxy>>;
  try {
    pdf = await unpdf.getDocumentProxy(pdfBytes, { password });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg)) throw new BacklogParseError(`PDF rechazó la password: ${msg}`, 'bad_password');
    throw new BacklogParseError(`Fallo al cargar el PDF: ${msg}`, 'pdf_load_failed');
  }

  if (pdf.numPages === 0) throw new BacklogParseError('PDF sin páginas', 'empty_pdf');

  const allItems: PdfTextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as unknown as PdfTextItem[]) {
      // Filtra TextMarkedContent (sin str/transform/width — solo marks estructurales).
      if (typeof (it as PdfTextItem).str === 'string' && Array.isArray((it as PdfTextItem).transform)) {
        allItems.push(it);
      }
    }
  }

  const rows = parseBacklogItems(allItems);
  return { rows, page_count: pdf.numPages, parsed_at: new Date().toISOString() };
}
