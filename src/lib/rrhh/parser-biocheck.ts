/**
 * Parser del Excel exportado por el reloj checador BioCheck de AC Proyectos.
 *
 * Columnas esperadas (del PPTX "Presentación Reloj Checador.pptx" paso 7):
 *   No   — número de empleado en el reloj (string, puede venir con padding)
 *   Name — nombre del empleado (puede venir vacío si el reloj aún no lo tiene;
 *          pain point conocido: altas aparecen sin nombre y la operadora lo
 *          asigna aparte). Fuente de verdad del nombre: rrhh_empleados.
 *   Time — timestamp de la checada (DateTime cell o string formateado).
 *
 * La exportación suele venir con los movimientos de TODOS los empleados
 * pegados en una sola hoja (sin separación). El parser los devuelve plano y
 * el orquestador los agrupa por empleado.
 *
 * Decisión 2026-10-13: parser tolera headers con mayúsculas/minúsculas y
 * trailing spaces (patrón findHeaderIndex). Si el Excel llega con otra marca
 * de reloj, extender aquí con detección de columnas alternativas.
 */

import ExcelJS from 'exceljs';
import { cellToPrimitive, cellRawValue, excelSerialToDate } from '@/lib/excel-io/read';

export interface BioCheckRow {
  /** Número de empleado en el reloj, tal cual aparece en columna "No". Normalizado a string sin padding. */
  relojId:  string;
  /** Nombre tal cual aparece en el Excel (puede venir vacío). Fuente de verdad: rrhh_empleados.nombre. */
  nombreEnReloj: string;
  /** Timestamp exacto de la checada en zona local America/Monterrey. */
  dateTime: Date;
  /** Fila original en el Excel (1-indexed) para debugging. */
  sourceRow: number;
}

export interface ParseResult {
  rows:     BioCheckRow[];
  warnings: string[];
  /** Nombres de columnas detectados (para debug). */
  detectedHeaders: string[];
}

const COLUMN_ALIASES = {
  no:   ['no', 'id', 'número', 'numero', 'enroll', 'enrollno'],
  name: ['name', 'nombre', 'employee', 'empleado'],
  time: ['time', 'datetime', 'date time', 'tiempo', 'fecha', 'fecha hora', 'punch time'],
};

function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): number {
  const norm = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = norm.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseTime(v: unknown, warnings: string[], rowNum: number): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    const d = excelSerialToDate(v);
    if (!d) return null;
    // Excel serial con parte fraccional representa horas del día.
    const frac = v - Math.floor(v);
    const secs = Math.round(frac * 86400);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, h, m, s));
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // Formatos típicos BioCheck: "2026-10-13 08:15:23", "13/10/2026 08:15",
    // "2026-10-13T08:15:23". Intenta Date() con fallback a parseo manual.
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // Formato DD/MM/YYYY HH:MM(:SS)?
    const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, dd, mm, yyyy, hh, mi, ss] = m;
      return new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +(ss ?? '0')));
    }
    warnings.push(`fila ${rowNum}: Time "${s}" no parseable, se ignora`);
    return null;
  }
  return null;
}

/**
 * Parsea un buffer de Excel exportado por el reloj BioCheck.
 * Devuelve rows plano + warnings de parseo (headers faltantes, celdas raras).
 */
export async function parseBioCheckExcel(buf: Buffer): Promise<ParseResult> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exceljs types stale vs Node 24 Buffer
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { rows: [], warnings: ['Excel sin hojas'], detectedHeaders: [] };
  }

  // Headers: fila 1
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = String(cellToPrimitive(cell.value) ?? '').trim();
  });

  const colNo   = findColumn(headers, COLUMN_ALIASES.no);
  const colName = findColumn(headers, COLUMN_ALIASES.name);
  const colTime = findColumn(headers, COLUMN_ALIASES.time);

  if (colNo < 0)   warnings.push(`columna "No" no encontrada entre: ${headers.join(', ')}`);
  if (colTime < 0) warnings.push(`columna "Time" no encontrada entre: ${headers.join(', ')}`);
  if (colNo < 0 || colTime < 0) {
    return { rows: [], warnings, detectedHeaders: headers };
  }

  const rows: BioCheckRow[] = [];
  const lastRow = ws.actualRowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const noVal   = cellRawValue(row.getCell(colNo   + 1).value);
    const nameVal = colName >= 0 ? cellRawValue(row.getCell(colName + 1).value) : null;
    const timeVal = cellRawValue(row.getCell(colTime + 1).value);
    if (noVal === null || noVal === undefined || noVal === '') continue;
    const relojId = String(noVal).trim();
    const nombreEnReloj = typeof nameVal === 'string' ? nameVal.trim() : '';
    const dateTime = parseTime(timeVal, warnings, r);
    if (!dateTime) continue;
    rows.push({ relojId, nombreEnReloj, dateTime, sourceRow: r });
  }

  return { rows, warnings, detectedHeaders: headers };
}
