// Helpers para leer XLSX y CSV a arrays de objetos (headers en fila 1).
// Reemplazan el uso previo de `xlsx` (SheetJS) que tiene vulns Prototype
// Pollution + ReDoS sin fix upstream. Usamos exceljs para XLSX y un parser
// manual RFC-4180-lite para CSV (evita depender de un paquete adicional).
//
// XLSX es async (exceljs carga vía JSZip). CSV es sync.

import ExcelJS from 'exceljs';

/** Convierte una celda exceljs a un valor primitivo consumible. */
export function cellToPrimitive(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((rt) => rt.text).join('');
    }
    if ('text' in v) return v.text;
    if ('result' in v) return v.result ?? '';
    if ('error' in v) return '';
    if (v instanceof Date) return v;
  }
  return v;
}

/**
 * Convierte un número serial de fecha Excel (días desde 1900-01-01, con el bug
 * del 29-feb-1900 que Excel trata como día real) a componentes UTC {y, m, d}.
 * Reemplazo directo de xlsx.SSF.parse_date_code para el subset que usamos.
 */
export function excelSerialToDate(serial: number): { y: number; m: number; d: number } | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const DAYS_1900_TO_1970 = 25569; // días desde 1900-01-01 hasta 1970-01-01
  const adjusted = serial > 59 ? serial - 1 : serial; // compensar bug 1900-02-29
  const ms = (adjusted - DAYS_1900_TO_1970) * 86400000;
  const date = new Date(ms);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

/**
 * Valor "raw" de una celda: preserva números, Dates y booleanos; devuelve null
 * para celdas vacías (equivalente a xlsx `sheet_to_json({ header:1, raw:true, defval:null })`).
 */
export function cellRawValue(v: ExcelJS.CellValue): string | number | boolean | Date | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      const s = v.richText.map((rt) => rt.text).join('');
      return s === '' ? null : s;
    }
    if ('text' in v) return v.text as string;
    if ('result' in v) return (v.result as string | number | boolean | Date | null) ?? null;
    if ('error' in v) return null;
    if (v instanceof Date) return v;
  }
  if (v === '') return null;
  return v as string | number | boolean;
}

export type ArrayRow = Array<string | number | boolean | Date | null>;

/**
 * Convierte worksheet a array of arrays preservando índices y tipos (equivalente
 * a `sheet_to_json(sheet, { header: 1, raw: true, blankrows: true, defval: null })`).
 */
export function sheetToArrayOfArrays(sheet: ExcelJS.Worksheet): ArrayRow[] {
  const colCount = sheet.columnCount;
  const rowCount = sheet.rowCount;
  const out: ArrayRow[] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: ArrayRow = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellRawValue(row.getCell(c).value));
    }
    out.push(cells);
  }
  return out;
}

/** Lee XLSX buffer y devuelve todas las hojas como array-of-arrays por hoja. */
export async function parseXlsxBufferAsArrays(
  buffer: Buffer,
): Promise<Array<{ name: string; rows: ArrayRow[] }>> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);
  return wb.worksheets.map((sheet) => ({
    name: sheet.name,
    rows: sheetToArrayOfArrays(sheet),
  }));
}

export interface SheetToObjectsOpts {
  /** Si true, todos los valores se convierten a string (equivalente a raw:false en xlsx). */
  asString?: boolean;
  /** Filas cuya primera celda está vacía cuentan igual (default true para header sano). */
  skipEmpty?: boolean;
}

/** Convierte una worksheet a array de objetos usando fila 1 como headers. */
export function sheetToObjects(
  sheet: ExcelJS.Worksheet,
  opts: SheetToObjectsOpts = {},
): Record<string, unknown>[] {
  const { asString = false, skipEmpty = true } = opts;
  const headers: string[] = [];
  const out: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = String(cellToPrimitive(cell.value) ?? '').trim();
      });
      return;
    }
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      const val = cellToPrimitive(row.getCell(i + 1).value);
      obj[key] = asString ? (val === '' || val == null ? '' : String(val)) : val;
    }
    if (skipEmpty && Object.values(obj).every((v) => v === '' || v == null)) return;
    out.push(obj);
  });
  return out;
}

/** Lee XLSX buffer y devuelve la primera hoja como array de objetos. */
export async function parseXlsxBuffer(
  buffer: Buffer,
  opts: SheetToObjectsOpts = {},
): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  return sheetToObjects(sheet, opts);
}

/**
 * Parser CSV RFC-4180-lite: soporta campos entre comillas dobles y "" como
 * escape. NO maneja newlines dentro de quotes (raro en catálogos PYME).
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (line === '') continue;
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQuotes = false; }
        } else {
          cur += ch;
        }
      } else if (ch === '"' && cur === '') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Serializa una worksheet a texto CSV, útil para pasarle a un LLM. */
export function sheetToCsvText(sheet: ExcelJS.Worksheet): string {
  const colCount = sheet.columnCount;
  const rowCount = sheet.rowCount;
  const rows: string[] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const v = cellToPrimitive(row.getCell(c).value);
      cells.push(csvEscape(v == null || v === '' ? '' : String(v)));
    }
    rows.push(cells.join(','));
  }
  return rows.join('\n');
}

/** Serializa un XLSX buffer a un texto con todas las hojas concatenadas. */
export async function xlsxBufferToText(buffer: Buffer, opts: { sheetHeader?: (name: string) => string } = {}): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);
  const header = opts.sheetHeader ?? ((name) => `# Hoja: ${name}`);
  const parts: string[] = [];
  for (const sheet of wb.worksheets) {
    const csv = sheetToCsvText(sheet).trim();
    if (csv) parts.push(`${header(sheet.name)}\n${csv}`);
  }
  return parts.join('\n\n');
}

/** Lee CSV buffer (UTF-8) y devuelve array de objetos usando fila 1 como headers. */
export function parseCsvBuffer(buffer: Buffer): Record<string, unknown>[] {
  const rows = parseCsvText(buffer.toString('utf-8'));
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, unknown>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      obj[key] = row[i] ?? '';
    }
    if (Object.values(obj).every((v) => v === '' || v == null)) continue;
    out.push(obj);
  }
  return out;
}
