/**
 * Parser del Excel semanal de Ramón Leang (persona física, retail tortilla).
 *
 * Layout: 1 archivo maestro vivo todo el año. Cada semana ocupa 2 columnas
 * adyacentes en un bloque mensual repetido:
 *
 *   Col N   (DEPÓSITOS)              Col N+1 (FACTURAS pre-calculadas)
 *   ─────────────────────────────    ─────────────────────────────────
 *   [fecha_inicio_semana]            (vacío)
 *   deposito_1                       "1, 2, 3, 4, 7"  ← días hábiles
 *   deposito_2                       14507            ← monto CFDI base
 *   deposito_3                       (vacío)
 *   deposito_4                       [fecha_ajuste]   ← fecha CFDI ajuste
 *   deposito_5                       14511.5          ← monto CFDI ajuste
 *   deposito_6                       (vacío)
 *   (vacío)                          (vacío)
 *   (vacío)                          (vacío)
 *   87046.5 (total depósitos)        (vacío)
 *
 * Reglas:
 *  - Nala NO calcula. Solo REPLICA los montos que ella (Beatriz) ya puso.
 *  - Cada CFDI base es $piso(total/N), los primeros N-1 = base, el último = ajuste.
 *  - Ella (Beatriz) puede tener criterios de redondeo propios; respetamos.
 *
 * Regla de facturación derivada:
 *  - Emitir 1 CFDI por cada día en `diasHabiles` con monto = cfdiBase
 *  - + 1 CFDI adicional con fecha = ajusteFecha y monto = ajusteMonto
 *  - Total: diasHabiles.length + 1 CFDIs por semana
 *
 * NOTA sobre múltiples bloques mensuales:
 *  Los bloques van hacia abajo en la hoja. Cada bloque agrupa 3-5 semanas
 *  del mismo mes. El año se infiere de la fecha del header semanal (que ya
 *  trae YYYY-MM-DD).
 */

import * as XLSX from 'xlsx';

// ---- Public types ---------------------------------------------------------

export interface ParsedWeekBlock {
  /** Fecha ISO YYYY-MM-DD del header inicial de la semana (col DEP). */
  weekStart:        string;
  /** Total de depósitos declarado al pie del bloque (col DEP). Null si no se encontró. */
  totalDepositos:   number | null;
  /** Monto base de las N-1 primeras facturas (col FAC, celda debajo de "días hábiles"). */
  cfdiBase:         number | null;
  /** Fecha ISO YYYY-MM-DD del CFDI de ajuste centavos (col FAC). */
  ajusteFecha:      string | null;
  /** Monto del CFDI de ajuste centavos (col FAC, celda debajo de fecha ajuste). */
  ajusteMonto:      number | null;
  /** Días del mes hábiles como enteros (ej. [1, 2, 3, 4, 7]). */
  diasHabiles:      number[];
  /** Texto crudo de días hábiles como aparece en el Excel. */
  diasHabilesRaw:   string;
  /** Depósitos individuales bajo el header (col DEP). Info operativa, no factura. */
  detalleDepositos: number[];
  /** Row index del header, para debug. */
  headerRowIndex:   number;
  /** Column index del header (col DEP). Col FAC = colIndex + 1. */
  colIndex:         number;
  /** Warnings no fatales del parseo del bloque. */
  warnings:         string[];
}

export interface ParseResult {
  blocks:   ParsedWeekBlock[];
  warnings: string[];
}

// ---- Helpers --------------------------------------------------------------

type Row = Array<string | number | Date | boolean | null | undefined>;

/**
 * Convierte fechas explícitas a ISO YYYY-MM-DD. NO convierte números a Excel
 * serial dates porque los montos ($14,507, $18,553) también son números y
 * disparaban falsos positivos como "año 1939". El parser confía en que el
 * Excel de Ramón Leang viene con `cellDates: true`, así que las fechas reales
 * ya son Date objects.
 */
function coerceFecha(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  return null;
}

/** Parsea una lista tipo "1, 2, 3, 4, 7" a [1,2,3,4,7]. Tolera espacios variables. */
function parseDiasHabiles(raw: string): number[] {
  return raw.split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => parseInt(s, 10))
    .filter(n => !Number.isNaN(n) && n >= 1 && n <= 31);
}

/**
 * True si la celda parece un header de semana: contiene una fecha (Date, número
 * serial o string ISO) en la columna DEP y encima o cerca no hay otro header.
 */
function isWeekHeaderCell(v: unknown): string | null {
  return coerceFecha(v);
}

// ---- Parser ---------------------------------------------------------------

/**
 * Parsea el buffer .xlsx de Ramón Leang y retorna todos los bloques semanales
 * encontrados. No hace side effects.
 */
export function parseRamonLeangXlsx(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const warnings: string[] = [];
  const blocks: ParsedWeekBlock[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet['!ref']) continue; // hoja vacía
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      raw: true,
      blankrows: true,
      defval: null,
    });

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        // Buscar celdas con fecha que sean header de semana. El heurístico:
        // celda tiene fecha, la celda arriba (r-1) NO tiene fecha en misma col,
        // y la celda debajo (r+1) tiene un número (primer depósito).
        const fecha = isWeekHeaderCell(row[c]);
        if (!fecha) continue;

        // Descartar rows que son solo la fecha de ajuste (esas están en col FAC
        // debajo de números, no arriba de números). Filtro: la celda debajo
        // (r+1, c) debe ser un número.
        const belowVal = rows[r + 1]?.[c];
        if (typeof belowVal !== 'number') continue;
        // Y la fecha en col+1 (col FAC) debe estar vacía o ser texto (días
        // hábiles), no otra fecha (para evitar confundir 2 headers adyacentes).
        const facHeaderVal = row[c + 1];
        if (facHeaderVal instanceof Date) continue;

        // Validación estricta para descartar falsos positivos (fechas de
        // ajuste de otra semana que casualmente están en col DEP tras un
        // depósito). Un header genuino de semana tiene:
        //  - Días hábiles legibles en (r+1, c+1) (ej. "1, 2, 3, 4, 7")
        //  - Monto CFDI base numérico en (r+2, c+1)
        const diasHabilesRaw = String(rows[r + 1]?.[c + 1] ?? '').trim();
        const cfdiBaseRaw = rows[r + 2]?.[c + 1];
        const hasDias = parseDiasHabiles(diasHabilesRaw).length > 0;
        const hasBase = typeof cfdiBaseRaw === 'number' && cfdiBaseRaw > 0;
        if (!hasDias || !hasBase) continue;

        // Es candidato a header de semana en (r, c). Parsear el bloque.
        const block = parseBlock(rows, r, c, fecha);
        blocks.push(block);
      }
    }
  }

  if (blocks.length === 0) {
    warnings.push('No se encontró ningún bloque semanal. Revisa que la hoja tenga fechas de inicio de semana en columnas de depósitos.');
  }

  return { blocks, warnings };
}

function parseBlock(rows: Row[], headerRow: number, colDep: number, weekStart: string): ParsedWeekBlock {
  const colFac = colDep + 1;
  const warnings: string[] = [];

  // Depósitos: filas consecutivas debajo del header con número en colDep.
  // Cortamos al encontrar una vacía. Reservamos que el TOTAL (última fila
  // con número después de al menos 2 vacías) NO cuenta como depósito.
  const detalleDepositos: number[] = [];
  let cursor = headerRow + 1;
  for (; cursor < rows.length; cursor++) {
    const v = rows[cursor]?.[colDep];
    if (typeof v === 'number') detalleDepositos.push(v);
    else if (v == null) break; // primera vacía después de depósitos
    else break;
  }
  const depositosFinRow = cursor - 1; // última fila con depósito

  // Total: buscar el próximo número aislado en colDep después de al menos 1
  // fila vacía. Debe estar dentro de las siguientes 10 filas (bloque no es
  // arbitrariamente grande).
  let totalDepositos: number | null = null;
  for (let r2 = depositosFinRow + 1; r2 < Math.min(rows.length, depositosFinRow + 12); r2++) {
    const v = rows[r2]?.[colDep];
    if (typeof v === 'number') { totalDepositos = v; break; }
  }

  // Días hábiles: en (headerRow+1, colFac) debería estar el texto tipo "1, 2, 3, 4, 7"
  const diasHabilesRaw = String(rows[headerRow + 1]?.[colFac] ?? '').trim();
  const diasHabiles = parseDiasHabiles(diasHabilesRaw);
  if (diasHabiles.length === 0) {
    warnings.push(`No se encontraron días hábiles en col ${colFac} fila ${headerRow + 1} (raw: "${diasHabilesRaw}"). Revísalo en el Excel.`);
  }

  // Monto CFDI base: en (headerRow+2, colFac). Es el monto que se repite N-1 veces.
  const cfdiBaseRaw = rows[headerRow + 2]?.[colFac];
  const cfdiBase = typeof cfdiBaseRaw === 'number' ? cfdiBaseRaw : null;
  if (cfdiBase == null) {
    warnings.push(`No se encontró monto CFDI base en col ${colFac} fila ${headerRow + 2}. Debe ser un número (piso(total/N)).`);
  }

  // Fecha de ajuste: buscar celda con fecha en col FAC entre las filas de depósitos.
  let ajusteFecha: string | null = null;
  let ajusteFechaRow = -1;
  for (let r2 = headerRow + 2; r2 <= depositosFinRow + 3; r2++) {
    const f = isWeekHeaderCell(rows[r2]?.[colFac]);
    if (f) { ajusteFecha = f; ajusteFechaRow = r2; break; }
  }

  // Monto de ajuste: en la fila SIGUIENTE a la fecha de ajuste, mismo col FAC.
  let ajusteMonto: number | null = null;
  if (ajusteFechaRow >= 0) {
    const v = rows[ajusteFechaRow + 1]?.[colFac];
    if (typeof v === 'number') ajusteMonto = v;
    else warnings.push(`Fecha de ajuste encontrada en fila ${ajusteFechaRow} pero no hay monto numérico debajo en col ${colFac}.`);
  } else {
    warnings.push('No se encontró fecha de ajuste (celda con fecha en col FAC entre depósitos).');
  }

  // Sanity check: si tenemos todo, verificar que suma cuadre con total declarado.
  if (
    totalDepositos != null &&
    cfdiBase != null &&
    ajusteMonto != null &&
    diasHabiles.length > 0
  ) {
    const sumaEsperada = cfdiBase * diasHabiles.length + ajusteMonto;
    const diff = Math.abs(sumaEsperada - totalDepositos);
    if (diff > 1) {
      warnings.push(
        `Suma de facturas ($${sumaEsperada.toFixed(2)}) no cuadra con total depósitos ($${totalDepositos.toFixed(2)}). Diferencia $${diff.toFixed(2)}. Revisa cuentas.`,
      );
    }
  }

  return {
    weekStart,
    totalDepositos,
    cfdiBase,
    ajusteFecha,
    ajusteMonto,
    diasHabiles,
    diasHabilesRaw,
    detalleDepositos,
    headerRowIndex: headerRow,
    colIndex:       colDep,
    warnings,
  };
}
