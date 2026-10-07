// Unit tests para backlog-syncer. Mock de GraphExcel para evitar red.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacklogRow } from '../backlog-parser';

vi.mock('../graph-excel', () => ({
  readRange:       vi.fn(),
  patchRange:      vi.fn(),
  autofitColumns:  vi.fn(),
  withSession:     vi.fn(async (_t, _l, fn) => fn({ id: 's1', persist: true, location: null })),
}));

const BASE_CTX = {
  portalEmail: 'camila@acproyectos.com',
  token:       't',
  config: {
    location: { scope: { type: 'me' as const }, itemId: 'ITEM-1' },
    sheets: {
      historico: { name: 'INVENTARIO', table: 'Tabla6' },
      stock:     { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' },
      backlog:   { name: 'BACKLOG', start_row: 5 },
    },
    columns_historico: { serie: 'SERIE' },
    estatus_validos:   ['ALMACEN'],
    bodegas_canonicas: ['FLETEROS'],
  },
};

const BACKLOG_CFG = { name: 'BACKLOG', start_row: 5 };

function makeRow(overrides: Partial<BacklogRow>): BacklogRow {
  return {
    order_type:             'Standard Order MX',
    customer_po_number:     '4599',
    order_number:           '80522090',
    project:                null,
    ordered_date:           '2025-11-18',
    line_number:            '1.5',
    item:                   'EAC180A3E0A1HY3*',
    lines_status:           'AWAITING_SHIPPING',
    warehouse:              'DCD',
    schedule_ship_date:     '2026-11-27',
    quantity:               2,
    backlog_usd:            18848.62,
    reserved:               2,
    reserved_backlog_usd:   18848.62,
    account_manager:        'Valdez, Hansel Alan',
    parse_errors:           [],
    ...overrides,
  };
}

describe('rowToExcelValues', () => {
  it('mapea los 8 campos en orden A..H', async () => {
    const { rowToExcelValues } = await import('../backlog-syncer');
    const r = makeRow({});
    const values = rowToExcelValues(r);
    expect(values).toEqual([
      '4599',                 // A OC AC
      '80522090',             // B OC TRANE
      '2025-11-18',           // C FECHA REGISTRO
      'EAC180A3E0A1HY3*',     // D MODELO
      2,                      // E CANTIDAD
      'AWAITING_SHIPPING',    // F ESTATUS TRANE
      '2026-11-27',           // G FECHA ENTREGA ESTIMADA
      'L1.5 · DCD · USD 18848.62 · RES 2',  // H NOTAS
    ]);
  });

  it('NOTAS omite campos null', async () => {
    const { rowToExcelValues } = await import('../backlog-syncer');
    const r = makeRow({ warehouse: null, reserved: null });
    const values = rowToExcelValues(r);
    expect(values[7]).toBe('L1.5 · USD 18848.62');
  });

  it('valores null quedan como "" (no "null" string)', async () => {
    const { rowToExcelValues } = await import('../backlog-syncer');
    const r = makeRow({ ordered_date: null, item: null });
    const values = rowToExcelValues(r);
    expect(values[2]).toBe('');
    expect(values[3]).toBe('');
  });
});

describe('rowKey', () => {
  it('compone (PO, LINE)', async () => {
    const { rowKey } = await import('../backlog-syncer');
    expect(rowKey(makeRow({ customer_po_number: '4599', line_number: '1.5' }))).toBe('4599::1.5');
  });
});

describe('excelRowKey', () => {
  it('extrae PO + línea del campo NOTAS', async () => {
    const { excelRowKey } = await import('../backlog-syncer');
    const row = ['4599', '80522090', '2025-11-18', 'EAC180A3E0A1HY3*', 2, 'AWAITING_SHIPPING', '2026-11-27', 'L1.5 · DCD · USD 18848.62 · RES 2'];
    expect(excelRowKey(row)).toBe('4599::1.5');
  });

  it('maneja NOTAS vacío', async () => {
    const { excelRowKey } = await import('../backlog-syncer');
    expect(excelRowKey(['4599', '', '', '', '', '', '', ''])).toBe('4599::');
  });

  it('maneja fila completamente vacía', async () => {
    const { excelRowKey } = await import('../backlog-syncer');
    expect(excelRowKey(['', '', '', '', '', '', '', ''])).toBe('::');
  });
});

describe('rowsEqual', () => {
  it('true para arrays con mismos valores', async () => {
    const { rowsEqual } = await import('../backlog-syncer');
    expect(rowsEqual(['a', 1, ''], ['a', 1, ''])).toBe(true);
  });

  it('number vs string stringificado se consideran iguales', async () => {
    const { rowsEqual } = await import('../backlog-syncer');
    expect(rowsEqual([2], ['2'])).toBe(true);
  });

  it('null, undefined y "" se consideran iguales', async () => {
    const { rowsEqual } = await import('../backlog-syncer');
    expect(rowsEqual([null], [''])).toBe(true);
    expect(rowsEqual([undefined], [''])).toBe(true);
  });

  // Regression: Excel coerce fechas ISO escritas como string ("2025-11-18") a serial
  // numbers (45979) al leerlas de vuelta. Sin esta normalización, re-correr el syncer
  // con el mismo PDF reportaba updated=45 cada vez (bug detectado en E2E 2026-10-02).
  // Las columnas C (FECHA REGISTRO, idx 2) y G (FECHA ENTREGA ESTIMADA, idx 6) son
  // fechas; los demás índices mantienen la comparación genérica.
  it('idempotency: fecha ISO en col date-aware == Excel serial del mismo día', async () => {
    const { rowsEqual } = await import('../backlog-syncer');
    // 8 columnas BACKLOG: idx 2 = FECHA REGISTRO, idx 6 = FECHA ENTREGA ESTIMADA
    // 2025-11-18 → Excel serial 45979 ; 2026-11-27 → 46353
    const written = ['4599', '80522090', '2025-11-18', 'EAC180A3E0A1HY3*', 2, 'AWAITING_SHIPPING', '2026-11-27', 'L1.5 · DCD · USD 18848.62 · RES 2'];
    const readBack = [4599, 80522090, 45979, 'EAC180A3E0A1HY3*', 2, 'AWAITING_SHIPPING', 46353, 'L1.5 · DCD · USD 18848.62 · RES 2'];
    expect(rowsEqual(written, readBack)).toBe(true);
  });

  it('idempotency: fecha ISO vs Excel serial de día DISTINTO → false', async () => {
    const { rowsEqual } = await import('../backlog-syncer');
    // 2025-11-18 vs serial 46000 (día distinto)
    const a = ['x', 'y', '2025-11-18', 'z', 1, 'S', '2026-11-27', 'n'];
    const b = ['x', 'y', 46000,       'z', 1, 'S', '2026-11-27', 'n'];
    expect(rowsEqual(a, b)).toBe(false);
  });

  it('idempotency: Excel serial fuera de rango de fechas (ej. 42 o 999999) NO se trata como fecha', async () => {
    const { rowsEqual } = await import('../backlog-syncer');
    // Row donde FECHA REGISTRO es un número 42 (no fecha): string "42" vs number 42 iguales por fallback numérico
    const a = ['x', 'y', '42',  'z', 1, 'S', '', 'n'];
    const b = ['x', 'y', 42,    'z', 1, 'S', '', 'n'];
    expect(rowsEqual(a, b)).toBe(true);
    // Pero "42" vs serial de fecha debería diferir
    const c = ['x', 'y', '2025-11-18', 'z', 1, 'S', '', 'n'];
    const d = ['x', 'y', 42,           'z', 1, 'S', '', 'n'];
    expect(rowsEqual(c, d)).toBe(false);
  });
});

describe('syncBacklogRows — upsert mode (merge inteligente)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('dryRun: sheet vacía → todas las filas cuentan como added', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [], formulas: [] });
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5' }), makeRow({ customer_po_number: '4600', line_number: '2.1' })];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: true, mode: 'upsert' });
    expect(summary).toMatchObject({ total_parsed: 2, added: 2, updated: 0, unchanged: 0, deleted: 0, mode: 'upsert', errors: [] });
    expect(gx.patchRange).not.toHaveBeenCalled();
  });

  it('dryRun: fila existente idéntica → unchanged', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const r = makeRow({});
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [rowToExcelValues(r)], formulas: [] });
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [r], { dryRun: true, mode: 'upsert' });
    expect(summary.unchanged).toBe(1);
    expect(summary.added).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('dryRun: upsert NO cuenta como deleted las filas Excel que no están en el PDF', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const zombie = makeRow({ customer_po_number: '9999', line_number: '7.7' });
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [rowToExcelValues(zombie)], formulas: [] });
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5' })];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: true, mode: 'upsert' });
    expect(summary.deleted).toBe(0);
    expect(summary.added).toBe(1);
  });

  it('write: append nueva fila patchRange A{nextRow}:H{nextRow}', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [], formulas: [] });
    const r = makeRow({});
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [r], { dryRun: false, mode: 'upsert' });
    expect(summary.added).toBe(1);
    expect(gx.patchRange).toHaveBeenCalledOnce();
    const [, , sheet, address] = vi.mocked(gx.patchRange).mock.calls[0];
    expect(sheet).toBe('BACKLOG');
    expect(address).toBe('A5:H5');
  });

  it('write: update fila existente al rowNumber correcto', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const old = makeRow({ lines_status: 'AWAITING_SUPPLY' });
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [rowToExcelValues(old)], formulas: [] });
    const nue = makeRow({ lines_status: 'AWAITING_SHIPPING' });
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [nue], { dryRun: false, mode: 'upsert' });
    expect(summary.updated).toBe(1);
    expect(gx.patchRange).toHaveBeenCalledOnce();
    const [, , sheet, address] = vi.mocked(gx.patchRange).mock.calls[0];
    expect(sheet).toBe('BACKLOG');
    expect(address).toBe('A5:H5');  // existing row N=5
  });

  it('mix: 1 added + 1 updated + 1 unchanged = 2 patchRange calls', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const existing1 = makeRow({ customer_po_number: '4599', line_number: '1.5', lines_status: 'AWAITING_SUPPLY' });
    const existing2 = makeRow({ customer_po_number: '4600', line_number: '2.1' });
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [rowToExcelValues(existing1), rowToExcelValues(existing2)],
      formulas: [],
    });
    const parsed = [
      makeRow({ customer_po_number: '4599', line_number: '1.5', lines_status: 'AWAITING_SHIPPING' }),  // updated
      makeRow({ customer_po_number: '4600', line_number: '2.1' }),                                     // unchanged
      makeRow({ customer_po_number: '4700', line_number: '1.0' }),                                     // added
    ];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: false, mode: 'upsert' });
    expect(summary).toMatchObject({ total_parsed: 3, added: 1, updated: 1, unchanged: 1, deleted: 0, mode: 'upsert', errors: [] });
    expect(gx.patchRange).toHaveBeenCalledTimes(2);
  });
});

describe('syncBacklogRows — replace mode (DEFAULT, Camila 2026-10-01)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mode default es "upsert" (cambio 2026-10-06: evita borrados silenciosos cuando el PDF trae menos filas que el Excel)', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [], formulas: [] });
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [makeRow({})], { dryRun: true });
    expect(summary.mode).toBe('upsert');
  });

  it('dryRun: cuenta deleted = filas Excel que NO están en el PDF nuevo', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const existing1 = makeRow({ customer_po_number: '4599', line_number: '1.5' });
    const existing2 = makeRow({ customer_po_number: '9999', line_number: '7.7' });  // zombie
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [rowToExcelValues(existing1), rowToExcelValues(existing2)],
      formulas: [],
    });
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5' })];  // zombie no está
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: true, mode: 'replace' });
    expect(summary.unchanged).toBe(1);
    expect(summary.deleted).toBe(1);
    expect(summary.mode).toBe('replace');
  });

  it('write: 1 solo patchRange atómico cubriendo filas parseadas + fill blanco de las eliminadas', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    // Excel actual tiene 3 filas en rows 5, 6, 7
    const r1 = makeRow({ customer_po_number: '4599', line_number: '1.5' });
    const r2 = makeRow({ customer_po_number: '9999', line_number: '7.7' });  // zombie
    const r3 = makeRow({ customer_po_number: '8888', line_number: '2.2' });  // zombie
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [rowToExcelValues(r1), rowToExcelValues(r2), rowToExcelValues(r3)],
      formulas: [],
    });
    // PDF nuevo tiene solo 1 fila
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5', lines_status: 'AWAITING_SHIPPING' })];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: false, mode: 'replace' });
    expect(summary.deleted).toBe(2);
    expect(summary.unchanged).toBe(1);
    expect(gx.patchRange).toHaveBeenCalledOnce();
    const [, , sheet, address, values] = vi.mocked(gx.patchRange).mock.calls[0];
    expect(sheet).toBe('BACKLOG');
    expect(address).toBe('A5:H7');  // cubre las 3 filas que había
    const arr = values as unknown[][];
    expect(arr).toHaveLength(3);
    // row 1: la fila parseada
    expect(arr[0][0]).toBe('4599');
    // rows 2 y 3: blanco (deleted)
    expect(arr[1]).toEqual(['', '', '', '', '', '', '', '']);
    expect(arr[2]).toEqual(['', '', '', '', '', '', '', '']);
  });

  it('SAFETY GUARD: replace con parsedRows vacío lanza BacklogSyncerError SIN leer ni escribir', async () => {
    const { syncBacklogRows, BacklogSyncerError } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    await expect(
      syncBacklogRows(BASE_CTX, BACKLOG_CFG, [], { dryRun: false, mode: 'replace' })
    ).rejects.toBeInstanceOf(BacklogSyncerError);
    expect(gx.patchRange).not.toHaveBeenCalled();
    expect(gx.readRange).not.toHaveBeenCalled();
  });

  // Regression 2026-10-02: BACKLOG humano de Camila (47 filas con formato
  // distinto) no era reconocido por excelRowKey → quedaba residual al final
  // de la hoja después del replace. Fix: maxContentRow trackea cualquier fila
  // con contenido, el replace blank-fillea hasta ahí.
  it('replace: filas con formato no-Nami (col A vacía) también se blank-fillean', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    // Simular 3 filas humanas: col A y B vacías, data real en C-H
    const humanRow = (po: string, item: string) => ['', '', po, item, 'AWAITING_SHIPPING', 2, '$1000.00', 2];
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [humanRow('4599', 'MODEL-A'), humanRow('5610', 'MODEL-B'), humanRow('7032', 'MODEL-C')],
      formulas: [],
    });
    // PDF nuevo trae 1 fila Nami
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5' })];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: false, mode: 'replace' });
    expect(summary.deleted).toBe(3);  // las 3 humanas no-reconocidas cuentan como deleted
    expect(summary.added).toBe(1);
    expect(gx.patchRange).toHaveBeenCalledOnce();
    const [, , , address, values] = vi.mocked(gx.patchRange).mock.calls[0];
    expect(address).toBe('A5:H7');  // cubre las 3 filas humanas + la nueva
    const arr = values as unknown[][];
    expect(arr).toHaveLength(3);
    expect(arr[0][0]).toBe('4599');                               // nueva fila Nami
    expect(arr[1]).toEqual(['', '', '', '', '', '', '', '']);     // blank
    expect(arr[2]).toEqual(['', '', '', '', '', '', '', '']);     // blank
  });

  it('replace: dryRun cuenta correctamente las filas no-reconocidas como deleted', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const humanRow = (po: string) => ['', '', po, 'X', 'S', 1, '$100', 1];
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [humanRow('a'), humanRow('b')],
      formulas: [],
    });
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5' })];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: true, mode: 'replace' });
    expect(summary.deleted).toBe(2);
    expect(summary.added).toBe(1);
    expect(gx.patchRange).not.toHaveBeenCalled();
  });
});
