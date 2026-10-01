// Unit tests para parser de BACKLOG TRANE.
// Fixtures mockean la salida de pdfjs (items posicionados) — no requieren
// el PDF real. Smoke test contra PDF real vive en _smoke/parse-backlog-dryrun.mjs.

import { describe, it, expect } from 'vitest';
import {
  groupItemsByRow,
  headerColumns,
  assignRowToColumns,
  mapColumnsToRow,
  parseBacklogItems,
  BacklogParseError,
} from '../backlog-parser';

function mkItem(x: number, y: number, str: string, width = Math.max(1, str.length * 5)): { str: string; transform: [number, number, number, number, number, number]; width: number } {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}

// Fixture replicando el output real de pdfjs del sample 2026-09-30:
// 1 fila de headers en y=1022 + 1 fila de datos en y=995.
const HEADER_ROW = [
  mkItem(127,  1022, 'ORDER TYPE'),
  mkItem(215,  1022, 'CUSTOMER PO NUMBER'),
  mkItem(348,  1022, 'ORDER NUMBER'),
  mkItem(443,  1022, 'PROJECT'),
  mkItem(502,  1022, 'ORDERED DATE'),
  mkItem(594,  1022, 'LINE NUMBER'),
  mkItem(713,  1022, 'ITEM'),
  mkItem(802,  1022, 'LINES STATUS'),
  mkItem(901,  1022, 'WAREHOUSE'),
  mkItem(979,  1022, 'SCHEDULE SHIP DATE'),
  mkItem(1102, 1022, 'QUANTITY'),
  mkItem(1165, 1022, 'BACKLOG USD'),
  mkItem(1252, 1022, 'RESERVED'),
  mkItem(1319, 1022, 'RESERVED BACKLOG USD'),
  mkItem(1463, 1022, 'ACCOUNT MANAGER'),
];

const DATA_ROW_1 = [
  mkItem(116,  995, 'Standard Order MX'),
  mkItem(264,  995, '4599'),
  mkItem(367,  995, '80522090'),
  // PROJECT vacío
  mkItem(516,  995, '2025-11-18'),
  mkItem(622,  995, '1.5'),
  mkItem(676,  995, 'EAC180A3E0A1HY3*'),
  mkItem(786,  995, 'AWAITING_SHIPPING'),
  mkItem(923,  995, 'DCD'),
  mkItem(1009, 995, '2026-11-27'),
  mkItem(1125, 995, '2'),
  mkItem(1179, 995, '$18848.62'),
  mkItem(1277, 995, '2'),
  mkItem(1361, 995, '$18848.62'),
  mkItem(1480, 995, 'Valdez, Hansel Alan'),
];

describe('groupItemsByRow', () => {
  it('agrupa por Y con tolerancia de 3 unidades', () => {
    const items = [
      mkItem(100, 500, 'A'),
      mkItem(200, 500, 'B'),
      mkItem(100, 502, 'C'),   // misma fila (|500-502|=2 ≤ 3)
      mkItem(100, 490, 'D'),   // fila diferente (|500-490|=10 > 3)
    ];
    const rows = groupItemsByRow(items);
    expect(rows).toHaveLength(2);
    expect(rows[0].map(i => i.str).sort()).toEqual(['A', 'B', 'C']);
    expect(rows[1].map(i => i.str)).toEqual(['D']);
  });

  it('ordena filas por Y descendente (encabezado arriba)', () => {
    const items = [
      mkItem(100, 300, 'bottom'),
      mkItem(100, 500, 'top'),
      mkItem(100, 400, 'middle'),
    ];
    const rows = groupItemsByRow(items);
    expect(rows.map(r => r[0].str)).toEqual(['top', 'middle', 'bottom']);
  });

  it('dentro de cada fila ordena items por X ascendente', () => {
    const items = [
      mkItem(300, 100, 'C'),
      mkItem(100, 100, 'A'),
      mkItem(200, 100, 'B'),
    ];
    const rows = groupItemsByRow(items);
    expect(rows[0].map(i => i.str)).toEqual(['A', 'B', 'C']);
  });

  it('array vacío → []', () => {
    expect(groupItemsByRow([])).toEqual([]);
  });
});

describe('headerColumns', () => {
  it('extrae los 15 headers esperados en orden', () => {
    const cols = headerColumns(HEADER_ROW);
    expect(cols.map(c => c.name)).toEqual([
      'ORDER TYPE', 'CUSTOMER PO NUMBER', 'ORDER NUMBER', 'PROJECT',
      'ORDERED DATE', 'LINE NUMBER', 'ITEM', 'LINES STATUS',
      'WAREHOUSE', 'SCHEDULE SHIP DATE', 'QUANTITY', 'BACKLOG USD',
      'RESERVED', 'RESERVED BACKLOG USD', 'ACCOUNT MANAGER',
    ]);
  });

  it('última columna termina en Infinity', () => {
    const cols = headerColumns(HEADER_ROW);
    expect(cols[cols.length - 1].xEnd).toBe(Number.POSITIVE_INFINITY);
  });

  it('headers partidos en 2 items (ej. "ORDER" "TYPE") se recombinan', () => {
    const splitHeaderRow = [
      mkItem(127, 1022, 'ORDER'),
      mkItem(160, 1022, 'TYPE'),
      mkItem(215, 1022, 'CUSTOMER PO NUMBER'),
    ];
    const cols = headerColumns(splitHeaderRow);
    expect(cols.map(c => c.name)).toEqual(['ORDER TYPE', 'CUSTOMER PO NUMBER']);
    // Primera columna siempre empieza en 0 (datos pueden ser left-aligned
    // antes del header). xEnd es midpoint entre su header start (127) y el
    // siguiente (215) = 171.
    expect(cols[0].xStart).toBe(0);
    expect(cols[0].xEnd).toBe(171);
  });

  it('ignora items con str vacío o width 0', () => {
    const row = [
      mkItem(127, 1022, 'ORDER TYPE'),
      { str: ' ', transform: [1, 0, 0, 1, 192, 1022] as [number, number, number, number, number, number], width: 0 },
      mkItem(215, 1022, 'CUSTOMER PO NUMBER'),
    ];
    const cols = headerColumns(row);
    expect(cols.map(c => c.name)).toEqual(['ORDER TYPE', 'CUSTOMER PO NUMBER']);
  });
});

describe('assignRowToColumns', () => {
  it('asigna cada item al bucket correcto por X', () => {
    const cols = headerColumns(HEADER_ROW);
    const assigned = assignRowToColumns(DATA_ROW_1, cols);
    expect(assigned['ORDER TYPE']).toBe('Standard Order MX');
    expect(assigned['CUSTOMER PO NUMBER']).toBe('4599');
    expect(assigned['ORDER NUMBER']).toBe('80522090');
    expect(assigned['PROJECT']).toBe('');
    expect(assigned['ORDERED DATE']).toBe('2025-11-18');
    expect(assigned['ACCOUNT MANAGER']).toBe('Valdez, Hansel Alan');
  });

  it('primera columna acepta items con X anterior al header start (left-aligned data)', () => {
    const cols = headerColumns(HEADER_ROW);
    // El header ORDER TYPE está centrado en x=127, el dato aparece left-aligned
    // en x=116 (ancho ≈ 85 vs header width 65). Primera columna empieza en 0.
    const earlyRow = [
      mkItem(116, 995, 'Standard Order MX'),
    ];
    const assigned = assignRowToColumns(earlyRow, cols);
    expect(assigned['ORDER TYPE']).toBe('Standard Order MX');
  });

  it('ITEM data en el gap entre LINE NUMBER y ITEM header cae en ITEM (midpoint boundary)', () => {
    const cols = headerColumns(HEADER_ROW);
    // ITEM header start=713; LINE NUMBER start=594; midpoint=653.5.
    // Dato de ITEM a x=676 debe caer en ITEM, NO en LINE NUMBER.
    const splitRow = [
      mkItem(622, 995, '1.5'),
      mkItem(676, 995, 'EAC180A3E0A1HY3*'),
    ];
    const assigned = assignRowToColumns(splitRow, cols);
    expect(assigned['LINE NUMBER']).toBe('1.5');
    expect(assigned['ITEM']).toBe('EAC180A3E0A1HY3*');
  });

  it('concatena items múltiples en la misma columna separados por espacio', () => {
    const cols = headerColumns(HEADER_ROW);
    const splitManagerRow = [
      mkItem(1480, 995, 'Valdez,'),
      mkItem(1510, 995, 'Hansel'),
      mkItem(1540, 995, 'Alan'),
    ];
    const assigned = assignRowToColumns(splitManagerRow, cols);
    expect(assigned['ACCOUNT MANAGER']).toBe('Valdez, Hansel Alan');
  });
});

describe('mapColumnsToRow', () => {
  it('mapea una fila completa válida sin errores de parseo', () => {
    const assigned = assignRowToColumns(DATA_ROW_1, headerColumns(HEADER_ROW));
    const row = mapColumnsToRow(assigned);
    expect(row.parse_errors).toEqual([]);
    expect(row.customer_po_number).toBe('4599');
    expect(row.order_number).toBe('80522090');
    expect(row.ordered_date).toBe('2025-11-18');
    expect(row.line_number).toBe('1.5');
    expect(row.item).toBe('EAC180A3E0A1HY3*');
    expect(row.lines_status).toBe('AWAITING_SHIPPING');
    expect(row.quantity).toBe(2);
    expect(row.backlog_usd).toBe(18848.62);
    expect(row.reserved).toBe(2);
    expect(row.reserved_backlog_usd).toBe(18848.62);
  });

  it('fecha mal formateada se guarda null y agrega error', () => {
    const row = mapColumnsToRow({ 'ORDER TYPE': 'X', 'CUSTOMER PO NUMBER': '1', 'ORDER NUMBER': '2', 'ORDERED DATE': '11/18/2025' });
    expect(row.ordered_date).toBeNull();
    expect(row.parse_errors.some(e => e.includes('ordered_date'))).toBe(true);
  });

  it('monto negativo o con comas en miles parsea correcto', () => {
    const row = mapColumnsToRow({ 'BACKLOG USD': '$1,234.56' });
    expect(row.backlog_usd).toBe(1234.56);
  });

  it('quantity no-entero agrega error (no acepta decimales)', () => {
    const row = mapColumnsToRow({ 'QUANTITY': '2.5' });
    expect(row.quantity).toBeNull();
    expect(row.parse_errors.some(e => e.includes('quantity'))).toBe(true);
  });
});

describe('parseBacklogItems — flujo completo (mocked pdfjs output)', () => {
  it('parsea 1 fila de datos del sample real', () => {
    const items = [...HEADER_ROW, ...DATA_ROW_1];
    const rows = parseBacklogItems(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].customer_po_number).toBe('4599');
    expect(rows[0].parse_errors).toEqual([]);
  });

  it('ignora fila sin ORDER TYPE+PO+ORDER NUMBER (footer, totales)', () => {
    const footerRow = [
      mkItem(828, 15, 'Page 1'),  // footer del sample real
    ];
    const items = [...HEADER_ROW, ...DATA_ROW_1, ...footerRow];
    const rows = parseBacklogItems(items);
    expect(rows).toHaveLength(1);
  });

  it('parsea múltiples filas de datos', () => {
    const DATA_ROW_2 = [
      mkItem(116,  970, 'Standard Order MX'),
      mkItem(264,  970, '4600'),
      mkItem(367,  970, '80522091'),
      mkItem(516,  970, '2025-11-19'),
      mkItem(622,  970, '2.1'),
      mkItem(676,  970, '4TXK6560G1000AA'),
      mkItem(786,  970, 'AWAITING_SUPPLY'),
      mkItem(923,  970, 'DCD'),
      mkItem(1009, 970, '2026-12-15'),
      mkItem(1125, 970, '5'),
      mkItem(1179, 970, '$5000.00'),
      mkItem(1277, 970, '0'),
      mkItem(1361, 970, '$0.00'),
      mkItem(1480, 970, 'Valdez, Hansel Alan'),
    ];
    const items = [...HEADER_ROW, ...DATA_ROW_1, ...DATA_ROW_2];
    const rows = parseBacklogItems(items);
    expect(rows).toHaveLength(2);
    expect(rows[0].line_number).toBe('1.5');
    expect(rows[1].line_number).toBe('2.1');
    expect(rows[1].lines_status).toBe('AWAITING_SUPPLY');
    expect(rows[1].reserved).toBe(0);
  });

  it('throw BacklogParseError no_header_row si no hay fila con "ORDER TYPE"', () => {
    const items = [mkItem(100, 500, 'random text')];
    expect(() => parseBacklogItems(items)).toThrow(BacklogParseError);
    expect(() => parseBacklogItems(items)).toThrow(/No se encontró fila de headers/);
  });
});
