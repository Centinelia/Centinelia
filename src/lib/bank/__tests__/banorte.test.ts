import { describe, it, expect } from 'vitest';
import { parseBanorteCsv, looksLikeBanorte } from '../parsers/banorte';

// Fixture sintético. Formato observado en export Banorte Banca En Línea:
// Fecha | Concepto | Depósitos | Retiros | Saldo | (Referencia opcional).
// Diferencia clave vs BBVA: columnas Depósitos/Retiros en lugar de Abono/Cargo.
const BANORTE_SAMPLE = `Fecha,Concepto,Depósitos,Retiros,Saldo,Referencia
01/09/2026,TRANSF SPEI TORTILLERIA ESTRELLA,25000.00,,25000.00,776001
02/09/2026,PAGO SERVICIO LUZ CFE,,1200.00,23800.00,
03/09/2026,DEPOSITO VENTANILLA,5000.00,,28800.00,
04/09/2026,COMISION DISPERSION NOMINA,,350.00,28450.00,
`;

const BANORTE_SHORT_HEADERS = `Fecha,Concepto,Deposito,Retiro,Saldo
10/09/2026,ABONO CLIENTE OXXO,15000.00,,15000.00
`;

describe('Banorte parser', () => {
  it('detecta formato Banorte por header con Depósitos/Retiros', () => {
    expect(looksLikeBanorte(BANORTE_SAMPLE)).toBe(true);
    expect(looksLikeBanorte('FECHA,DESCRIPCIÓN,CARGO,ABONO\n')).toBe(false);
    expect(looksLikeBanorte('')).toBe(false);
  });

  it('acepta variantes singulares Deposito/Retiro', () => {
    expect(looksLikeBanorte(BANORTE_SHORT_HEADERS)).toBe(true);
  });

  it('parsea 4 transacciones', () => {
    const txns = parseBanorteCsv(BANORTE_SAMPLE);
    expect(txns).toHaveLength(4);
  });

  it('clasifica depósitos como credit y retiros como debit', () => {
    const txns = parseBanorteCsv(BANORTE_SAMPLE);
    expect(txns[0].kind).toBe('credit');
    expect(txns[0].amount).toBe(25000);
    expect(txns[1].kind).toBe('debit');
    expect(txns[1].amount).toBe(1200);
    expect(txns[3].kind).toBe('debit');
    expect(txns[3].amount).toBe(350);
  });

  it('extrae referencia cuando viene', () => {
    const txns = parseBanorteCsv(BANORTE_SAMPLE);
    expect(txns[0].reference).toBe('776001');
    expect(txns[1].reference).toBeNull();
  });

  it('preserva concepto como description', () => {
    const txns = parseBanorteCsv(BANORTE_SAMPLE);
    expect(txns[0].description).toContain('TORTILLERIA ESTRELLA');
  });

  it('parsea fechas DD/MM/YYYY', () => {
    const txns = parseBanorteCsv(BANORTE_SAMPLE);
    expect(txns[0].date.getUTCFullYear()).toBe(2026);
    expect(txns[0].date.getUTCMonth()).toBe(8);
    expect(txns[0].date.getUTCDate()).toBe(1);
  });

  it('funciona sin columna de referencia', () => {
    const txns = parseBanorteCsv(BANORTE_SHORT_HEADERS);
    expect(txns).toHaveLength(1);
    expect(txns[0].reference).toBeNull();
    expect(txns[0].amount).toBe(15000);
  });

  it('devuelve array vacío si no reconoce header', () => {
    expect(parseBanorteCsv('')).toEqual([]);
    expect(parseBanorteCsv('basura total')).toEqual([]);
  });

  it('ignora filas sin monto (0/0)', () => {
    const csv = `Fecha,Concepto,Depósitos,Retiros,Saldo
15/09/2026,FILA VACIA,,,,
16/09/2026,OK,100.00,,100.00
`;
    const txns = parseBanorteCsv(csv);
    expect(txns).toHaveLength(1);
    expect(txns[0].description).toBe('OK');
  });
});
