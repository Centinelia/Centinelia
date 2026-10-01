import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { decodeBuffer, isXlsxBuffer, bufferToCsvText } from '../parsers';
import { parseBankStatementBuffer } from '../parsers';

describe('decodeBuffer encoding autodetect', () => {
  it('decodifica UTF-8 plano', () => {
    const buf = Buffer.from('FECHA,DESCRIPCIÓN\n15/09/2026,SPEI con acentos áéíóúñ', 'utf-8');
    const text = decodeBuffer(buf);
    expect(text).toContain('DESCRIPCIÓN');
    expect(text).toContain('áéíóúñ');
  });

  it('decodifica UTF-8 con BOM', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from('FECHA,DESCRIPCIÓN\n15/09/2026,TEXTO', 'utf-8');
    const text = decodeBuffer(Buffer.concat([bom, body]));
    expect(text.startsWith('FECHA')).toBe(true); // BOM descartado
    expect(text).toContain('DESCRIPCIÓN');
  });

  it('decodifica UTF-16 LE con BOM', () => {
    const bom = Buffer.from([0xff, 0xfe]);
    const body = Buffer.from('FECHA,TEXTO', 'utf16le');
    const text = decodeBuffer(Buffer.concat([bom, body]));
    expect(text).toBe('FECHA,TEXTO');
  });

  it('decodifica Windows-1252 (BBVA legacy sin BOM, con acentos)', () => {
    // Bytes 0xD3 = 'Ó' en Windows-1252 (y en ISO-8859-1 también)
    // UTF-8 "DESCRIPCIÓN" sería DESCRIPCI\xc3\x93N — distinto
    const w1252 = Buffer.from([
      0x44, 0x45, 0x53, 0x43, 0x52, 0x49, 0x50, 0x43, 0x49, 0xd3, 0x4e, // DESCRIPCIÓN
    ]);
    const text = decodeBuffer(w1252);
    expect(text).toBe('DESCRIPCIÓN');
  });

  it('UTF-8 bytes inválidos → cae a Windows-1252', () => {
    const buf = Buffer.from([0x48, 0x4f, 0x4c, 0x41, 0xa0, 0x4d, 0x58]); // HOLA\xa0MX
    const text = decodeBuffer(buf);
    // \xa0 en Windows-1252 es nbsp (U+00A0), no replacement char
    expect(text.length).toBe(7);
    expect(text).toContain('HOLA');
    expect(text).toContain('MX');
  });

  it('Buffer vacío → string vacío', () => {
    expect(decodeBuffer(Buffer.alloc(0))).toBe('');
  });
});

describe('isXlsxBuffer', () => {
  it('detecta magic bytes XLSX', () => {
    const magic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    expect(isXlsxBuffer(magic)).toBe(true);
  });

  it('rechaza CSV plano', () => {
    expect(isXlsxBuffer(Buffer.from('FECHA,TEXTO'))).toBe(false);
  });

  it('rechaza buffer corto', () => {
    expect(isXlsxBuffer(Buffer.from([0x50, 0x4b]))).toBe(false);
  });
});

describe('bufferToCsvText routing', () => {
  it('serializa XLSX real a CSV concatenado', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Estado');
    sheet.addRow(['FECHA', 'DESCRIPCIÓN', 'CARGO', 'ABONO', 'SALDO', 'REFERENCIA']);
    sheet.addRow(['15/09/2026', 'SPEI RECIBIDO OXXO', '', 15000, 15000, '0012345678']);

    const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
    const text = await bufferToCsvText(xlsxBuf);
    expect(text).toContain('FECHA');
    expect(text).toContain('DESCRIPCIÓN');
    expect(text).toContain('15/09/2026');
  });

  it('devuelve el mismo texto CSV si el Buffer ya es CSV plano', async () => {
    const buf = Buffer.from('FECHA,DESCRIPCIÓN\n15/09/2026,OK', 'utf-8');
    const text = await bufferToCsvText(buf);
    expect(text).toContain('OK');
  });
});

describe('parseBankStatementBuffer end-to-end', () => {
  it('BBVA UTF-8 CSV plano', async () => {
    const buf = Buffer.from(
      `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,SPEI RECIBIDO OXXO,,15000.00,15000.00,0012345678
`,
      'utf-8',
    );
    const res = await parseBankStatementBuffer(buf);
    expect(res.bankSlug).toBe('bbva');
    expect(res.txns).toHaveLength(1);
    expect(res.txns[0].amount).toBe(15000);
  });

  it('BBVA Windows-1252 (legacy sin BOM, acentos nativos)', async () => {
    const content =
      'FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA\n' +
      '15/09/2026,SPEI RECIBIDO,,15000.00,15000.00,REF1\n';
    // Encode a Windows-1252: Node no tiene writer directo pero latin1 cubre
    // los caracteres de este fixture (acentos de 'DESCRIPCIÓN' incluidos).
    const buf = Buffer.from(content, 'latin1');
    const res = await parseBankStatementBuffer(buf);
    expect(res.bankSlug).toBe('bbva');
    expect(res.txns).toHaveLength(1);
  });

  it('XLSX Banorte end-to-end', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Movimientos');
    sheet.addRow(['Fecha', 'Concepto', 'Depósitos', 'Retiros', 'Saldo']);
    sheet.addRow(['01/09/2026', 'TRANSF SPEI', 25000, '', 25000]);
    sheet.addRow(['02/09/2026', 'PAGO LUZ', '', 1200, 23800]);
    const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await parseBankStatementBuffer(xlsxBuf);
    expect(res.bankSlug).toBe('banorte');
    expect(res.txns).toHaveLength(2);
    expect(res.txns[0].amount).toBe(25000);
    expect(res.txns[1].kind).toBe('debit');
  });

  it('Buffer vacío → unknown bank, 0 txns', async () => {
    const res = await parseBankStatementBuffer(Buffer.alloc(0));
    expect(res.bankSlug).toBe('unknown');
    expect(res.txns).toHaveLength(0);
  });
});
