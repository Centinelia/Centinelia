import { describe, it, expect } from 'vitest';
import { parseBbvaCsv, looksLikeBbva } from '../parsers/bbva';

// Fixture sintético. Representa el formato BBVA Net Cash observado en exports
// públicos (DD/MM/YYYY, columnas FECHA/DESCRIPCIÓN/CARGO/ABONO/SALDO/REFERENCIA).
// Si Tortillería/cliente real da un CSV con otro layout, agregar un fixture
// nuevo aquí antes de ajustar el parser.
const BBVA_SAMPLE = `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,SPEI RECIBIDO OXXO FACT 00047,,15000.00,45000.00,0012345678
15/09/2026,COMISION MANEJO CUENTA,250.00,,44750.00,
16/09/2026,DEPOSITO EFECTIVO SUCURSAL,,3200.50,47950.50,
17/09/2026,SPEI RECIBIDO TORTAS LUPITA,,8500.00,56450.50,0098765432
`;

const BBVA_SEMICOLON = `FECHA;DESCRIPCIÓN;CARGO;ABONO;SALDO;REFERENCIA
20/09/2026;TRANSFERENCIA SPEI RECIBIDA;;5000.00;60000.00;111222
`;

const BBVA_WITH_PREAMBLE = `BBVA MEXICO S.A.
ESTADO DE CUENTA DEL 01/09/2026 AL 30/09/2026

FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,SPEI RECIBIDO OXXO FACT 00047,,15000.00,45000.00,0012345678
`;

describe('BBVA parser', () => {
  it('detecta formato BBVA por header', () => {
    expect(looksLikeBbva(BBVA_SAMPLE)).toBe(true);
    expect(looksLikeBbva('FECHA,CONCEPTO,DEPOSITOS,RETIROS\n')).toBe(false);
    expect(looksLikeBbva('')).toBe(false);
  });

  it('parsea 4 transacciones del fixture base', () => {
    const txns = parseBbvaCsv(BBVA_SAMPLE);
    expect(txns).toHaveLength(4);
  });

  it('clasifica crédito vs débito correctamente', () => {
    const txns = parseBbvaCsv(BBVA_SAMPLE);
    expect(txns[0].kind).toBe('credit'); // abono SPEI
    expect(txns[0].amount).toBe(15000);
    expect(txns[1].kind).toBe('debit'); // cargo comisión
    expect(txns[1].amount).toBe(250);
    expect(txns[2].kind).toBe('credit');
    expect(txns[2].amount).toBe(3200.5);
  });

  it('parsea fechas DD/MM/YYYY como UTC-naive día local', () => {
    const txns = parseBbvaCsv(BBVA_SAMPLE);
    expect(txns[0].date.getUTCFullYear()).toBe(2026);
    expect(txns[0].date.getUTCMonth()).toBe(8); // septiembre = 8
    expect(txns[0].date.getUTCDate()).toBe(15);
  });

  it('extrae referencia cuando viene no vacía', () => {
    const txns = parseBbvaCsv(BBVA_SAMPLE);
    expect(txns[0].reference).toBe('0012345678');
    expect(txns[1].reference).toBeNull(); // comisión sin ref
    expect(txns[3].reference).toBe('0098765432');
  });

  it('preserva descripción original para búsqueda de folio', () => {
    const txns = parseBbvaCsv(BBVA_SAMPLE);
    expect(txns[0].description).toContain('OXXO');
    expect(txns[0].description).toContain('FACT 00047');
  });

  it('registra sourceRow 1-indexed respecto a la fila de datos', () => {
    const txns = parseBbvaCsv(BBVA_SAMPLE);
    expect(txns[0].sourceRow).toBe(2); // header=1, primer dato=2
    expect(txns[3].sourceRow).toBe(5);
  });

  it('soporta separador punto y coma', () => {
    const txns = parseBbvaCsv(BBVA_SEMICOLON);
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(5000);
    expect(txns[0].kind).toBe('credit');
  });

  it('ignora líneas de preámbulo antes del header', () => {
    const txns = parseBbvaCsv(BBVA_WITH_PREAMBLE);
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(15000);
  });

  it('maneja montos con comas de miles (es-MX)', () => {
    const csv = `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,DEPOSITO GRANDE,,"125,340.75","125,340.75",REF1
`;
    const txns = parseBbvaCsv(csv);
    expect(txns[0].amount).toBe(125340.75);
  });

  it('devuelve array vacío si no detecta header BBVA', () => {
    expect(parseBbvaCsv('cualquier basura\nsin header')).toEqual([]);
    expect(parseBbvaCsv('')).toEqual([]);
  });

  it('ignora filas con fecha inválida', () => {
    const csv = `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,OK,,100,100,
NO-ES-FECHA,RUIDO,,50,,
32/13/2026,FECHA IMPOSIBLE,,50,,
16/09/2026,OK2,,200,300,
`;
    const txns = parseBbvaCsv(csv);
    expect(txns).toHaveLength(2);
    expect(txns.map((t) => t.description)).toEqual(['OK', 'OK2']);
  });
});
