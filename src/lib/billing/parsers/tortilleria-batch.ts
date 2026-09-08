/**
 * Parser del batch semanal de la Tortillería Estrella.
 *
 * Beatriz manda cada lunes uno o varios Excels con este layout:
 *
 * <pre>
 * NOMBRE CLIENTE (CTE. NNN)                      ← header de bloque, código dentro
 *   ó
 * N CTE:NNN NOMBRE CLIENTE (RAZON SOCIAL)        ← header de bloque, código fuera
 *
 * Fecha | Folio | Suc | PROD_A | PROD_B | ... | TOTAL
 *                       precioA | precioB | ...                ← fila de precios
 * 2026-09-01 | 1234 | SUC_X | 40   |       | ... | 880         ← remisión 1
 * 2026-09-02 | 5678 | SUC_Y | 20   | 10    | ... | 660         ← remisión 2
 * ...
 *
 * TOTAL KILOS      |     | 60  | 10 |     ... |      ← agregado por producto
 * CANT EN PESOS    |     |1320 |220 |     ... |      ← subtotal por producto
 *                                       TOTAL GENERAL: 1540    ← total del bloque
 * FACTURA [65845]                                    ← opcional, folio pre-existente
 * </pre>
 *
 * Regla de facturación: **1 bloque = 1 CFDI**. Beatriz ya diseñó el Excel
 * reflejando los agrupamientos (ej. Balderas aparece en 3 bloques porque
 * quiere 3 facturas separadas; DCA aparece en 1 aunque tenga varias sucursales).
 *
 * Parser es determinístico: sin AI, sin fuzzy. Match de producto columna→SKU
 * viene en fase 2 con mapping asistido guardado por cliente.
 */

import * as XLSX from 'xlsx';

// ---- Public types ----------------------------------------------------------

export interface ParsedRemision {
  /** Fecha de la remisión (parseada de la celda). */
  fecha: string;
  /** Folio de la remisión tal como aparece en el Excel (puede traer basura). */
  folio: string;
  /** Sucursal / referencia libre. Puede ser null. */
  sucursal: string | null;
  /** Cantidad por columna de producto (índice = idx en `productos` del bloque). */
  cantidades: Array<number | null>;
  /** TOTAL de la fila si el Excel lo tenía calculado. Null si estaba vacío. */
  totalRow: number | null;
  /** Row index absoluto en la hoja, para debug/traceability. */
  rowIndex: number;
}

export interface ParsedProducto {
  /** Nombre display tal como aparece en el header de columna. Puede ser number/basura. */
  columnaNombre: string;
  /** Índice absoluto de columna en la hoja. */
  columnaIdx: number;
  /** Precio unitario del bloque. Null si la celda de precio estaba vacía. */
  precioUnit: number | null;
  /** Suma de `cantidades[i]` de todas las remisiones del bloque para este producto. */
  cantidadTotal: number;
  /** subtotal = cantidadTotal × precioUnit (null si falta uno de los dos). */
  subtotalCalculado: number | null;
}

export interface ParsedBlock {
  /**
   * Código de cliente extraído del header (ej. "045", "SILLATPROP", "593").
   * Null cuando el header no trae CTE. explícito (ej. Melendez, donde el
   * bloque solo dice "MELENDEZ HACIENDA / ROMULO" y el mapping nombre→código
   * lo resuelve la capa de integración con un catálogo guardado).
   */
  codigoCliente: string | null;
  /** Texto crudo del header, para inspección/debug. */
  tituloBloque: string;
  /** Row index del header del bloque, para debug. */
  headerRowIndex: number;
  /** Productos del bloque, en el orden que aparecen en las columnas. */
  productos: ParsedProducto[];
  /** Remisiones/líneas del bloque. Ya viene filtrado a filas con datos reales. */
  remisiones: ParsedRemision[];
  /** TOTAL GENERAL declarado en el Excel para el bloque. Null si no encontrado. */
  totalGeneralExcel: number | null;
  /** Suma de subtotalCalculado de productos con cantidad > 0. */
  totalGeneralCalculado: number;
  /**
   * Warnings no-fatales encontrados durante el parseo. Ejemplos:
   *  - Header de columna raro (número donde debería ir texto)
   *  - Total del Excel diverge del calculado por más de $1
   *  - Precio faltante en un producto con cantidades
   */
  warnings: string[];
}

export interface ParseResult {
  blocks: ParsedBlock[];
  /** Warnings a nivel documento (no de un bloque específico). */
  warnings: string[];
}

// ---- Parser ----------------------------------------------------------------

type Row = Array<string | number | Date | boolean | null | undefined>;

/**
 * Extrae el código de cliente del texto del header del bloque.
 *
 * Formatos vistos en la práctica:
 *   "CARDENAS ALIMENTOS (CTE. 045)"                      → 045
 *   "1 CTE:593 CARNES ORTIZ (MA DEL ROSARIO)"            → 593
 *   "CTE. SILLA TPROP. (ADAN HUGO MARTINEZ)"             → SILLATPROP
 *   "   3 CTE:595  CARNES ORTIZ (KARINA LIZETH ...)  +"  → 595
 *
 * Estrategia:
 *  1. Si "CTE" está DENTRO de un paréntesis, capturar lo que le sigue hasta
 *     el paréntesis de cierre (Cardenas).
 *  2. Si "CTE" está FUERA de paréntesis:
 *     - Si el token que le sigue empieza con dígitos, capturar solo los
 *       dígitos consecutivos (Ortiz: 593, 594, 595).
 *     - Si empieza con letras, capturar hasta el paréntesis abrí (o fin
 *       de string) y normalizar (Silla: "SILLA TPROP." → "SILLATPROP").
 */
const CTE_INSIDE_PAREN = /\(\s*CTE\s*[.:]\s*([A-Z0-9]+)\s*\)/i;
const CTE_OUTSIDE       = /\bCTE\s*[:.]\s*([^\s(].*?)(?:\s*\(|$)/i;

function extractCodigo(headerText: string): string | null {
  // Caso 1: CTE dentro del paréntesis.
  const inside = CTE_INSIDE_PAREN.exec(headerText);
  if (inside) return inside[1].trim().toUpperCase();

  // Caso 2: CTE fuera del paréntesis.
  const outside = CTE_OUTSIDE.exec(headerText);
  if (!outside) return null;

  const raw = outside[1].trim();

  // Si empieza con dígito, capturar solo los dígitos iniciales.
  if (/^\d/.test(raw)) {
    const digitsOnly = /^(\d+)/.exec(raw);
    return digitsOnly ? digitsOnly[1] : null;
  }

  // Empieza con letra: normalizar removiendo espacios y puntos.
  const normalized = raw.replace(/[\s.]+/g, '').toUpperCase();
  return normalized || null;
}

/**
 * Detecta filas que son header de bloque de cliente.
 *
 * Header = fila cuya primer celda es texto (nombre del cliente/sucursal) y
 * NO es fila de columnas ni fila de totales/factura. La validación real de
 * "es header de bloque" se hace en `parseTortilleriaBatchXlsx` verificando
 * que la próxima fila (o cerca) tenga "FECHA|FOLIO...".
 *
 * Si el texto trae "CTE:NNN" o "(CTE. NNN)", capturamos el código. Si no,
 * dejamos codigo=null y el downstream resuelve el mapping por nombre.
 */
function isBlockHeader(row: Row): { text: string; codigo: string | null } | null {
  const cell = row[0];
  if (typeof cell !== 'string') return null;
  const text = cell.trim();
  if (!text) return null;

  // Excluir filas que sabemos NO son header de bloque.
  if (isColumnHeader(row)) return null;
  if (isTerminalRow(row))  return null;

  const codigo = extractCodigo(text);
  return { text, codigo };
}

/**
 * Detecta la fila de header de columnas. Empieza con Fecha/FECHA y en
 * alguna columna siguiente aparece Folio/FOLIO. Case-insensitive.
 */
function isColumnHeader(row: Row): boolean {
  const c0 = String(row[0] ?? '').trim().toLowerCase();
  if (c0 !== 'fecha') return false;
  for (let i = 1; i < Math.min(row.length, 5); i++) {
    if (String(row[i] ?? '').trim().toLowerCase() === 'folio') return true;
  }
  return false;
}

/**
 * Detecta y extrae el TOTAL GENERAL del bloque a partir de una fila.
 * Cubre dos layouts:
 *  1. Fila con texto "TOTAL GENERAL:" en algún col + número a la derecha
 *     (Cardenas/Silla/Ortiz).
 *  2. Fila que empieza con "FACTURA" y trae el total en la columna TOTAL
 *     (Melendez). El número legacy que a veces aparece en col 1 (folio de
 *     factura viejo) se ignora — Beatriz lo usaba para identificar y no
 *     forma parte del dato canónico.
 */
function extractTotalGeneral(row: Row, totalColIdx: number): number | null {
  // Layout 1: "TOTAL GENERAL:" explícito.
  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    if (typeof cell === 'string' && /total\s+general/i.test(cell)) {
      for (let j = i + 1; j < row.length; j++) {
        const v = row[j];
        if (typeof v === 'number') return v;
      }
    }
  }
  // Layout 2: fila FACTURA con total en la columna TOTAL.
  const c0 = String(row[0] ?? '').trim().toUpperCase();
  if (c0.startsWith('FACTURA') && totalColIdx !== -1) {
    const v = row[totalColIdx];
    if (typeof v === 'number') return v;
  }
  return null;
}

/**
 * Detecta filas terminales del bloque (TOTAL KILOS, CANT EN PESOS, FACTURA).
 * Tolera el typo "TORAL KILOS" que aparece en el Excel de Melendez.
 */
function isTerminalRow(row: Row): boolean {
  const c0 = String(row[0] ?? '').trim().toLowerCase();
  return /^(?:total|toral)\s+kilos/i.test(c0)
      || /^cant\s+en\s+pesos/i.test(c0)
      || /^factura\b/i.test(c0);
}

/** Coerción de fecha a ISO YYYY-MM-DD. Robusta a Date, string, null. */
function coerceFecha(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') {
    // Excel serial date. Convertimos con XLSX helper.
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return null;
}

/** Coerción de folio a string. Preserva basura para debug pero recorta whitespace. */
function coerceFolio(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** True si la fila tiene datos de remisión (fecha en col 0, folio en col 1). */
function isRemisionRow(row: Row): boolean {
  const fecha = coerceFecha(row[0]);
  if (!fecha) return false;
  const folio = coerceFolio(row[1]);
  return folio.length > 0;
}

/**
 * Parsea un buffer .xlsx del batch semanal de la tortillería. Devuelve todos
 * los bloques encontrados. No hace side effects, no valida contra catálogo
 * CONTPAQi; solo interpreta el layout.
 */
export function parseTortilleriaBatchXlsx(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const warnings: string[] = [];
  const blocks: ParsedBlock[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      raw: true,
      blankrows: true,
      defval: null,
    });

    let i = 0;
    while (i < rows.length) {
      const row = rows[i] ?? [];
      const header = isBlockHeader(row);
      if (!header) { i++; continue; }

      // Encontramos header de bloque; iniciar parseo.
      const block = parseBlock(rows, i, header);
      blocks.push(block);
      i = block.remisiones.length > 0
        ? block.remisiones[block.remisiones.length - 1].rowIndex + 1
        : i + 1;
    }
  }

  if (blocks.length === 0) {
    warnings.push('No se encontró ningún bloque de cliente en el archivo. Revisa que los headers tengan "CTE.NNN" o "CTE:NNN".');
  }

  return { blocks, warnings };
}

function parseBlock(rows: Row[], headerIdx: number, header: { text: string; codigo: string | null }): ParsedBlock {
  const warnings: string[] = [];

  // Encontrar la fila de "Fecha | Folio" (usualmente headerIdx + 1, permite 2-3 filas de gap).
  let colHeaderIdx = -1;
  for (let j = headerIdx + 1; j < Math.min(headerIdx + 5, rows.length); j++) {
    if (isColumnHeader(rows[j] ?? [])) { colHeaderIdx = j; break; }
  }
  if (colHeaderIdx === -1) {
    warnings.push('No se encontró fila de header de columnas (Fecha | Folio) después del header del bloque.');
    return {
      codigoCliente:         header.codigo,
      tituloBloque:          header.text,
      headerRowIndex:        headerIdx,
      productos:             [],
      remisiones:            [],
      totalGeneralExcel:     null,
      totalGeneralCalculado: 0,
      warnings,
    };
  }

  const colHeader = rows[colHeaderIdx] ?? [];
  const priceRow  = rows[colHeaderIdx + 1] ?? [];

  // Localizar las columnas anclas para saber el rango de productos:
  //   FECHA (col 0), FOLIO (col 1..N), [SUC opcional], productos..., TOTAL.
  // La columna "Suc" a veces existe (Cardenas/Ortiz) y a veces no (Melendez).
  const folioColIdx = findFolioColumn(colHeader);
  const sucColIdx   = findSucColumn(colHeader);   // -1 si no existe
  const totalColIdx = findTotalColumn(colHeader); // -1 si no existe

  const firstProductCol = (sucColIdx !== -1 ? sucColIdx : folioColIdx) + 1;
  const lastProductColExclusive = totalColIdx !== -1 ? totalColIdx : colHeader.length;

  const productos: ParsedProducto[] = [];
  const productCols: number[] = [];
  for (let c = firstProductCol; c < lastProductColExclusive; c++) {
    const nombreRaw = colHeader[c];
    const precioRaw = priceRow[c];
    if (nombreRaw == null || nombreRaw === '') continue;

    const columnaNombre = String(nombreRaw).trim();
    const precioUnit    = typeof precioRaw === 'number' ? precioRaw : null;

    if (typeof nombreRaw === 'number') {
      warnings.push(`Columna ${c}: header es un número (${nombreRaw}), probablemente header truncado. Se conservará el valor pero requiere mapping manual.`);
    }
    productos.push({
      columnaNombre,
      columnaIdx:        c,
      precioUnit,
      cantidadTotal:     0,
      subtotalCalculado: null,
    });
    productCols.push(c);
  }

  // Parsear remisiones hasta encontrar fila terminal.
  const remisiones: ParsedRemision[] = [];
  let totalGeneralExcel: number | null = null;
  let cursor = colHeaderIdx + 2;
  for (; cursor < rows.length; cursor++) {
    const r = rows[cursor] ?? [];

    // Header de siguiente bloque → parar sin consumir.
    if (isBlockHeader(r)) break;

    // TOTAL GENERAL detectado en la fila → capturar y NO parar todavía
    // (después vienen filas TOTAL KILOS / CANT EN PESOS que sí terminan).
    const tg = extractTotalGeneral(r, totalColIdx);
    if (tg != null) totalGeneralExcel = tg;

    // Fila terminal → parar. cursor queda apuntando a la fila terminal (para el próximo header).
    if (isTerminalRow(r)) continue;

    // Fila de remisión válida.
    if (isRemisionRow(r)) {
      const cantidades = productCols.map(idx => {
        const v = r[idx];
        return typeof v === 'number' ? v : null;
      });
      const totalRow = totalColIdx !== -1 && typeof r[totalColIdx] === 'number'
        ? (r[totalColIdx] as number)
        : null;
      const sucursal = sucColIdx !== -1 && typeof r[sucColIdx] === 'string'
        ? (r[sucColIdx] as string).trim()
        : null;
      remisiones.push({
        fecha:      coerceFecha(r[0])!,
        folio:      coerceFolio(r[1]),
        sucursal,
        cantidades,
        totalRow,
        rowIndex:   cursor,
      });
    }
  }

  // Agregar cantidades por producto y calcular subtotales.
  for (const rem of remisiones) {
    for (let p = 0; p < productos.length; p++) {
      const q = rem.cantidades[p];
      if (q != null && q > 0) productos[p].cantidadTotal += q;
    }
  }
  let totalGeneralCalculado = 0;
  for (const prod of productos) {
    if (prod.cantidadTotal > 0) {
      if (prod.precioUnit == null) {
        warnings.push(`Producto "${prod.columnaNombre}" (col ${prod.columnaIdx}) tiene ${prod.cantidadTotal} kg sin precio. No se puede calcular subtotal.`);
      } else {
        prod.subtotalCalculado = Math.round(prod.cantidadTotal * prod.precioUnit * 100) / 100;
        totalGeneralCalculado += prod.subtotalCalculado;
      }
    }
  }
  totalGeneralCalculado = Math.round(totalGeneralCalculado * 100) / 100;

  // Validación contra el total declarado.
  if (totalGeneralExcel != null) {
    const diff = Math.abs(totalGeneralCalculado - totalGeneralExcel);
    if (diff > 1) {
      warnings.push(`Total calculado ${totalGeneralCalculado} difiere del TOTAL GENERAL del Excel ${totalGeneralExcel} por $${diff.toFixed(2)}. Revisar.`);
    }
  } else {
    warnings.push('No se encontró TOTAL GENERAL en el bloque; no se puede validar consistencia.');
  }

  return {
    codigoCliente:         header.codigo,
    tituloBloque:          header.text,
    headerRowIndex:        headerIdx,
    productos,
    remisiones,
    totalGeneralExcel,
    totalGeneralCalculado,
    warnings,
  };
}

/** Encuentra la columna cuyo header es exactamente "TOTAL" (case-insensitive). */
function findTotalColumn(colHeader: Row): number {
  for (let c = 0; c < colHeader.length; c++) {
    const v = colHeader[c];
    if (typeof v === 'string' && v.trim().toUpperCase() === 'TOTAL') return c;
  }
  return -1;
}

/** Encuentra la columna "FOLIO" (case-insensitive). Debería estar en col 1 casi siempre. */
function findFolioColumn(colHeader: Row): number {
  for (let c = 0; c < colHeader.length; c++) {
    const v = colHeader[c];
    if (typeof v === 'string' && v.trim().toUpperCase() === 'FOLIO') return c;
  }
  return 1; // fallback razonable
}

/** Encuentra la columna "SUC" o "SUCURSAL". Retorna -1 si no existe (Melendez). */
function findSucColumn(colHeader: Row): number {
  for (let c = 0; c < colHeader.length; c++) {
    const v = colHeader[c];
    if (typeof v !== 'string') continue;
    const up = v.trim().toUpperCase();
    if (up === 'SUC' || up === 'SUCURSAL') return c;
  }
  return -1;
}
