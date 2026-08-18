import { describe, it, expect } from 'vitest';
import { ExcelWorkbook } from '../workbook';
import { DailySalesSchema, PendingClientSchema, HistoryMonthlySchema } from '../schemas';

describe('ExcelWorkbook', () => {
  it('creates empty workbook from schema', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    const rows = wb.getRows('Ventas');
    expect(rows).toEqual([]);
  });

  it('appendRow and getRows roundtrip', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    wb.appendRow('Ventas', {
      num: 1, hora: '09:20', cliente: 'DONA MARI', rfc: 'TDM040101ABC',
      productos: '5kg tortilla', total: 90, metodo: 'Efectivo', status: 'Pendiente', factura: ''
    });
    const rows = wb.getRows('Ventas');
    expect(rows).toHaveLength(1);
    expect(rows[0].cliente).toBe('DONA MARI');
  });

  it('appendRow preserves numeric value', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    wb.appendRow('Ventas', {
      num: 5, hora: '10:00', cliente: 'Test', rfc: 'RFC123',
      productos: 'item', total: 350.75, metodo: 'Transferencia', status: 'Pendiente', factura: ''
    });
    const rows = wb.getRows('Ventas');
    expect(rows[0].total).toBe(350.75);
    expect(rows[0].num).toBe(5);
  });

  it('updateRow modifies matching row', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    wb.appendRow('Ventas', {
      num: 1, hora: '09:20', cliente: 'X', rfc: '', productos: '',
      total: 0, metodo: 'Efectivo', status: 'Pendiente', factura: ''
    });
    const count = wb.updateRow('Ventas', r => r.num === 1, { status: 'Facturado', factura: 'A-100' });
    const rows = wb.getRows('Ventas');
    expect(count).toBe(1);
    expect(rows[0].status).toBe('Facturado');
    expect(rows[0].factura).toBe('A-100');
  });

  it('updateRow returns 0 when no match', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    wb.appendRow('Ventas', {
      num: 1, hora: '09:20', cliente: 'X', rfc: '', productos: '',
      total: 0, metodo: 'Efectivo', status: 'Pendiente', factura: ''
    });
    const count = wb.updateRow('Ventas', r => r.num === 99, { status: 'Facturado' });
    expect(count).toBe(0);
    expect(wb.getRows('Ventas')[0].status).toBe('Pendiente');
  });

  it('deleteRow removes matching row', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    wb.appendRow('Ventas', {
      num: 1, hora: '09:00', cliente: 'A', rfc: '', productos: '',
      total: 100, metodo: 'Efectivo', status: 'Pendiente', factura: ''
    });
    wb.appendRow('Ventas', {
      num: 2, hora: '10:00', cliente: 'B', rfc: '', productos: '',
      total: 200, metodo: 'Efectivo', status: 'Pendiente', factura: ''
    });
    const count = wb.deleteRow('Ventas', r => r.num === 1);
    const rows = wb.getRows('Ventas');
    expect(count).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].cliente).toBe('B');
  });

  it('toBuffer + fromBuffer roundtrip', async () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    wb.appendRow('Ventas', {
      num: 1, hora: '09:20', cliente: 'A', rfc: '', productos: '',
      total: 100, metodo: 'Efectivo', status: 'Pendiente', factura: ''
    });
    const buf = await wb.toBuffer();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
    const wb2 = await ExcelWorkbook.fromBuffer(buf, DailySalesSchema);
    const rows = wb2.getRows('Ventas');
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(100);
    expect(rows[0].cliente).toBe('A');
  });

  it('toBuffer + fromBuffer preserves multi-row data', async () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    for (let i = 1; i <= 3; i++) {
      wb.appendRow('Ventas', {
        num: i, hora: `0${i + 8}:00`, cliente: `Cliente ${i}`, rfc: '',
        productos: 'item', total: i * 100, metodo: 'Efectivo', status: 'Pendiente', factura: ''
      });
    }
    const buf = await wb.toBuffer();
    const wb2 = await ExcelWorkbook.fromBuffer(buf, DailySalesSchema);
    const rows = wb2.getRows('Ventas');
    expect(rows).toHaveLength(3);
    expect(rows[2].total).toBe(300);
  });

  it('multi-sheet: HistoryMonthlySchema has 12 sheets', () => {
    const wb = ExcelWorkbook.empty(HistoryMonthlySchema);
    const sheetNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    for (const name of sheetNames) {
      expect(wb.getRows(name)).toEqual([]);
    }
  });

  it('multi-sheet: append to specific month sheet', () => {
    const wb = ExcelWorkbook.empty(HistoryMonthlySchema);
    wb.appendRow('Mar', {
      fechaCorte: '2026-03-31', folio: 'CFD-001', periodo: 'Marzo 2026',
      lineas: 'Tortilla 10kg x $200', total: 200, ventasSources: 'ref-abc'
    });
    expect(wb.getRows('Ene')).toHaveLength(0);
    expect(wb.getRows('Mar')).toHaveLength(1);
    expect(wb.getRows('Mar')[0].folio).toBe('CFD-001');
  });

  it('PendingClientSchema creates sheet Pendientes', () => {
    const wb = ExcelWorkbook.empty(PendingClientSchema);
    wb.appendRow('Pendientes', {
      num: 1, fecha: '2026-08-17', productos: 'Tortilla 5kg',
      total: 90, metodo: 'Efectivo', ventasSources: 'ref-xyz'
    });
    const rows = wb.getRows('Pendientes');
    expect(rows).toHaveLength(1);
    expect(rows[0].productos).toBe('Tortilla 5kg');
  });

  it('getRows returns empty array for unknown sheet', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    expect(wb.getRows('NO_EXISTE')).toEqual([]);
  });

  it('appendRow throws for unknown sheet', () => {
    const wb = ExcelWorkbook.empty(DailySalesSchema);
    expect(() => wb.appendRow('NO_EXISTE', { num: 1 })).toThrow();
  });
});
