/**
 * Genera 3 xlsx dummy con el mismo layout que Beatriz manda pero con datos
 * ficticios pequeños. Usa clientes REALES del mapping para que el pipeline
 * los resuelva sin errores; los totales chicos (round) los distinguen a ojo
 * de los reales.
 *
 * Output: scripts/output/dummy-{varios,ortiz,melendez}.xlsx
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as XLSX from 'xlsx';

interface DummyBlock {
  header:     string;
  columnas:   string[];       // ej: ['FECHA','FOLIO','SUC','ESTRELLA 1/2','TOTAL']
  precios:    (number|null)[]; // aligned con columnas; solo llena en las de producto
  remisiones: Array<{ fecha: string; folio: string; suc: string | null; qtys: (number|null)[]; total: number }>;
  incluirSuc: boolean;
}

/** Convierte YYYY-MM-DD a Date en UTC noon (evita drift por timezone). */
function dateFrom(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function blockToRows(b: DummyBlock): (string|number|null)[][] {
  const rows: (string|number|null)[][] = [];
  rows.push([b.header]);
  rows.push(b.columnas);
  // Fila de precios alineada con columnas.
  rows.push(b.precios);
  for (const r of b.remisiones) {
    // Fecha como Date (Excel serial) para que isBlockHeader del parser no la
    // trate como header string. Beatriz exporta así en su Excel real.
    const fecha = dateFrom(r.fecha);
    const row: (string|number|Date|null)[] = b.incluirSuc
      ? [fecha, r.folio, r.suc, ...r.qtys, r.total]
      : [fecha, r.folio, ...r.qtys, r.total];
    rows.push(row as (string|number|null)[]);
  }
  // Fila TOTAL KILOS por producto (agregado).
  const totalKilos: (string|number|null)[] = b.incluirSuc
    ? ['TOTAL KILOS', null, null]
    : ['TOTAL KILOS', null];
  for (let p = 0; p < b.remisiones[0].qtys.length; p++) {
    const suma = b.remisiones.reduce((s, r) => s + (r.qtys[p] ?? 0), 0);
    totalKilos.push(suma || null);
  }
  totalKilos.push(null);
  rows.push(totalKilos);
  // Fila TOTAL GENERAL. Col 0 debe quedar null (si tuviera texto, isBlockHeader
  // del parser la tomaría como header nuevo, rompiendo el flujo). El parser
  // busca "TOTAL GENERAL" en TODAS las columnas via extractTotalGeneral, así
  // que lo ponemos en una col interior.
  const totalGeneral = b.remisiones.reduce((s, r) => s + r.total, 0);
  const tgRow: (string|number|null)[] = new Array(b.columnas.length + 1).fill(null);
  const tgLabelCol = Math.max(1, b.columnas.length - 2);
  tgRow[tgLabelCol]     = 'TOTAL GENERAL:';
  tgRow[tgLabelCol + 1] = totalGeneral;
  rows.push(tgRow);
  rows.push([]);
  return rows;
}

function writeXlsx(blocks: DummyBlock[], path: string) {
  const rows: (string|number|null)[][] = [];
  for (const b of blocks) rows.push(...blockToRows(b));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Facturación');
  mkdirSync(dirname(path), { recursive: true });
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  writeFileSync(path, buffer);
  console.log(`  ✓ ${path}`);
}

// Semana dummy: usar fechas de esta semana (2026-09-08 lunes .. 2026-09-12 viernes).
const L = '2026-09-08', M = '2026-09-09', X = '2026-09-10', J = '2026-09-11';

// Headers alineados a titlePattern exactos del mapping para que todos matcheen
// y salgan con RFC real (ver voice_agents.features.tortilleria_mapping).

// -- varios.xlsx style --------------------------------------------------------
const variosBlocks: DummyBlock[] = [
  // Cardenas: rfc=CAL960522981. 2 remisiones round → total 663.
  {
    header:     'CARDENAS ALIMENTOS (CTE. 045)',
    columnas:   ['FECHA','FOLIO','SUC','ESTRELLA 1/2','TOTAL'],
    precios:    [null, null, null, 22.10, null],
    incluirSuc: true,
    remisiones: [
      { fecha: L, folio: 'DUMMY-01', suc: 'TEST-A', qtys: [10], total: 221.00 },
      { fecha: M, folio: 'DUMMY-02', suc: 'TEST-B', qtys: [20], total: 442.00 },
    ],
  },
  // Silla TPROP (crédito → PPD): rfc=MATA850818NX7. Header = titlePattern completo.
  {
    header:     'CTE. SILLA TPROP. (ADAN HUGO MARTINEZ) CAMBIO DE PRECIO A 22.50 MARZO 2025',
    columnas:   ['FECHA','FOLIO','SUC','RANCHO 1KG','TOTAL'],
    precios:    [null, null, null, 30.00, null],
    incluirSuc: true,
    remisiones: [
      { fecha: X, folio: 'DUMMY-03', suc: 'TEST', qtys: [5], total: 150.00 },
    ],
  },
  // DCA consolidado: 2 sucursales con patterns REALES del mapping, se juntan en 1 CFDI.
  {
    header:     'DCA (INDEPENDENCIA/CENTRO)',
    columnas:   ['FECHA','FOLIO','SUC','TACO 1KG','TOTAL'],
    precios:    [null, null, null, 25.00, null],
    incluirSuc: true,
    remisiones: [
      { fecha: L, folio: 'DUMMY-04', suc: 'IND', qtys: [4], total: 100.00 },
    ],
  },
  {
    header:     'DCA PABLO LIVAS',
    columnas:   ['FECHA','FOLIO','SUC','TACO 1KG','TOTAL'],
    precios:    [null, null, null, 25.00, null],
    incluirSuc: true,
    remisiones: [
      { fecha: M, folio: 'DUMMY-05', suc: 'PLV', qtys: [6], total: 150.00 },
    ],
  },
];

// -- ortiz.xlsx style: sin columna SUC, 2 razones sociales -------------------
const ortizBlocks: DummyBlock[] = [
  // rfc=BACM600602IX1. Header exacto del pattern.
  {
    header:     '1 CTE:593 CARNES ORTIZ (MA DEL ROSARIO)',
    columnas:   ['FECHA','FOLIO','ROJA','TOTAL'],
    precios:    [null, null, 20.00, null],
    incluirSuc: false,
    remisiones: [
      { fecha: L, folio: 'DUMMY-06', suc: null, qtys: [5], total: 100.00 },
      { fecha: J, folio: 'DUMMY-07', suc: null, qtys: [10], total: 200.00 },
    ],
  },
  // rfc=OIBD830524K59.
  {
    header:     '2 CTE:594 CARNES ORTIZ (DIANA RUBI ORTIZ BARRON)',
    columnas:   ['FECHA','FOLIO','ROJA','TOTAL'],
    precios:    [null, null, 20.00, null],
    incluirSuc: false,
    remisiones: [
      { fecha: X, folio: 'DUMMY-08', suc: null, qtys: [3], total: 60.00 },
    ],
  },
];

// -- melendez.xlsx style: sucursales, sin columna SUC ------------------------
// Patterns tienen DOBLE espacio entre MELENDEZ y sucursal (tal cual el Excel real).
const melendezBlocks: DummyBlock[] = [
  // rfc=CMT170216BE8. Pattern real incluye " / ROMULO".
  {
    header:     'MELENDEZ HACIENDA / ROMULO',
    columnas:   ['FECHA','FOLIO','ESTRELLA','TOTAL'],
    precios:    [null, null, 22.10, null],
    incluirSuc: false,
    remisiones: [
      { fecha: L, folio: 'DUMMY-09', suc: null, qtys: [8], total: 176.80 },
    ],
  },
  // rfc=CMT170216BE8
  {
    header:     'MELENDEZ  HUINALA',
    columnas:   ['FECHA','FOLIO','ESTRELLA','TOTAL'],
    precios:    [null, null, 22.10, null],
    incluirSuc: false,
    remisiones: [
      { fecha: M, folio: 'DUMMY-10', suc: null, qtys: [12], total: 265.20 },
    ],
  },
];

console.log('Generando dummy xlsx...');
writeXlsx(variosBlocks,   'scripts/output/dummy-varios.xlsx');
writeXlsx(ortizBlocks,    'scripts/output/dummy-ortiz.xlsx');
writeXlsx(melendezBlocks, 'scripts/output/dummy-melendez.xlsx');
console.log('Done.');
