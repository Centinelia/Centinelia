import { describe, it, expect } from 'vitest';
import { parseBankStatement } from '../parsers';

const BBVA_CSV = `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
15/09/2026,SPEI RECIBIDO,,15000.00,15000.00,0012345678
`;

const BANORTE_CSV = `Fecha,Concepto,Depósitos,Retiros,Saldo
01/09/2026,TRANSF SPEI,25000.00,,25000.00
`;

describe('parseBankStatement autodetect', () => {
  it('detecta BBVA sin hint', () => {
    const res = parseBankStatement(BBVA_CSV);
    expect(res.bankSlug).toBe('bbva');
    expect(res.txns).toHaveLength(1);
    expect(res.txns[0].amount).toBe(15000);
  });

  it('detecta Banorte sin hint', () => {
    const res = parseBankStatement(BANORTE_CSV);
    expect(res.bankSlug).toBe('banorte');
    expect(res.txns).toHaveLength(1);
    expect(res.txns[0].amount).toBe(25000);
  });

  it('respeta hint explícito aunque el otro parse también funcione', () => {
    const res = parseBankStatement(BBVA_CSV, 'banorte');
    // Hint fuerza banorte, pero el header no cuadra → vacío
    expect(res.bankSlug).toBe('banorte');
    expect(res.txns).toHaveLength(0);
  });

  it('devuelve bankSlug=unknown y txns vacíos si nada cuadra', () => {
    const res = parseBankStatement('basura total\nsin header');
    expect(res.bankSlug).toBe('unknown');
    expect(res.txns).toHaveLength(0);
  });

  it('calcula ventana del statement a partir de las txns', () => {
    const csv = `Fecha,Concepto,Depósitos,Retiros,Saldo
01/09/2026,A,100,,100
15/09/2026,B,200,,300
30/09/2026,C,50,,350
`;
    const res = parseBankStatement(csv);
    expect(res.statementPeriodStart?.getUTCDate()).toBe(1);
    expect(res.statementPeriodEnd?.getUTCDate()).toBe(30);
  });

  it('statement period null si no hay txns', () => {
    const res = parseBankStatement('nada');
    expect(res.statementPeriodStart).toBeNull();
    expect(res.statementPeriodEnd).toBeNull();
  });
});
