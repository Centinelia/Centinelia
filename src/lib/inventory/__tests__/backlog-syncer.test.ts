// Unit tests para backlog-syncer. Mock de GraphExcel para evitar red.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacklogRow } from '../backlog-parser';

vi.mock('../graph-excel', () => ({
  readRange:    vi.fn(),
  patchRange:   vi.fn(),
  withSession:  vi.fn(async (_t, _l, fn) => fn({ id: 's1', persist: true, location: null })),
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
});

describe('syncBacklogRows — dryRun', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('con sheet vacía: todas las filas cuentan como added', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [], formulas: [] });
    const parsed = [makeRow({ customer_po_number: '4599', line_number: '1.5' }), makeRow({ customer_po_number: '4600', line_number: '2.1' })];
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: true });
    expect(summary).toEqual({ total_parsed: 2, added: 2, updated: 0, unchanged: 0, errors: [] });
    expect(gx.patchRange).not.toHaveBeenCalled();
  });

  it('con una fila existente idéntica: cuenta como unchanged', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const r = makeRow({});
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [rowToExcelValues(r)],
      formulas: [],
    });
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [r], { dryRun: true });
    expect(summary.unchanged).toBe(1);
    expect(summary.added).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('con una fila existente distinta (status cambió): cuenta como updated', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const old = makeRow({ lines_status: 'AWAITING_SUPPLY' });
    const nue = makeRow({ lines_status: 'AWAITING_SHIPPING' });
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [rowToExcelValues(old)],
      formulas: [],
    });
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [nue], { dryRun: true });
    expect(summary.updated).toBe(1);
    expect(summary.added).toBe(0);
    expect(summary.unchanged).toBe(0);
  });
});

describe('syncBacklogRows — write mode', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('append nueva fila: patchRange A{nextRow}:H{nextRow}', async () => {
    const { syncBacklogRows } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    vi.mocked(gx.readRange).mockResolvedValue({ address: 'A5:H1004', values: [], formulas: [] });
    const r = makeRow({});
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [r], { dryRun: false });
    expect(summary.added).toBe(1);
    expect(gx.patchRange).toHaveBeenCalledOnce();
    const [, , sheet, address] = vi.mocked(gx.patchRange).mock.calls[0];
    expect(sheet).toBe('BACKLOG');
    expect(address).toBe('A5:H5');
  });

  it('update fila existente: patchRange al rowNumber correcto', async () => {
    const { syncBacklogRows, rowToExcelValues } = await import('../backlog-syncer');
    const gx = await import('../graph-excel');
    const old = makeRow({ lines_status: 'AWAITING_SUPPLY' });
    vi.mocked(gx.readRange).mockResolvedValue({
      address: 'A5:H1004',
      values: [rowToExcelValues(old)],
      formulas: [],
    });
    const nue = makeRow({ lines_status: 'AWAITING_SHIPPING' });
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, [nue], { dryRun: false });
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
    const summary = await syncBacklogRows(BASE_CTX, BACKLOG_CFG, parsed, { dryRun: false });
    expect(summary).toEqual({ total_parsed: 3, added: 1, updated: 1, unchanged: 1, errors: [] });
    expect(gx.patchRange).toHaveBeenCalledTimes(2);
  });
});
