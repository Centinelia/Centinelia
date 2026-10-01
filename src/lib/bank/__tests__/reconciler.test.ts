import { describe, it, expect } from 'vitest';
import { reconcile, scoreMatch } from '../reconciler';
import type { RawBankTxn, InvoiceCandidate } from '../types';

const txn = (over: Partial<RawBankTxn> = {}): RawBankTxn => ({
  date: new Date(Date.UTC(2026, 8, 15)),
  amount: 15000,
  kind: 'credit',
  description: 'SPEI RECIBIDO OXXO',
  reference: null,
  sourceRow: 2,
  ...over,
});

const inv = (over: Partial<InvoiceCandidate> = {}): InvoiceCandidate => ({
  uuid: 'uuid-base',
  folio: 'F-001',
  total: 15000,
  issuedAt: new Date(Date.UTC(2026, 8, 15)),
  metodoPago: 'PUE',
  clienteRfc: 'OXX010101AAA',
  clienteNombre: 'OXXO SA DE CV',
  paidSoFar: 0,
  ...over,
});

describe('scoreMatch', () => {
  it('monto exacto + fecha exacta → score alto (dim amount y date al 100)', () => {
    const s = scoreMatch(txn(), inv());
    // Score total depende también de reference (bonus parcial por nombre
    // cliente en descripción). amount y date sí deben ser perfectos.
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect(s.breakdown.amount).toBe(100);
    expect(s.breakdown.date).toBe(100);
  });

  it('monto 1% off → score alto pero no perfecto', () => {
    const s = scoreMatch(txn({ amount: 15150 }), inv()); // 1% off
    expect(s.breakdown.amount).toBeGreaterThanOrEqual(85);
    expect(s.breakdown.amount).toBeLessThan(100);
  });

  it('monto 10% off → score bajo', () => {
    const s = scoreMatch(txn({ amount: 16500 }), inv());
    expect(s.breakdown.amount).toBeLessThanOrEqual(50);
  });

  it('monto 50% off → amount score 0', () => {
    const s = scoreMatch(txn({ amount: 7500 }), inv());
    expect(s.breakdown.amount).toBe(0);
  });

  it('fecha 3 días después → date score decae pero no se desploma', () => {
    const t = txn({ date: new Date(Date.UTC(2026, 8, 18)) });
    const s = scoreMatch(t, inv());
    expect(s.breakdown.date).toBeGreaterThanOrEqual(70);
    expect(s.breakdown.date).toBeLessThan(100);
  });

  it('fecha 60 días antes → date score 0 (fuera de ventana)', () => {
    const t = txn({ date: new Date(Date.UTC(2026, 6, 15)) });
    const s = scoreMatch(t, inv());
    expect(s.breakdown.date).toBe(0);
  });

  it('referencia txn aparece en folio del CFDI → bonus', () => {
    const s = scoreMatch(
      txn({ reference: 'F-001' }),
      inv({ folio: 'F-001' }),
    );
    expect(s.breakdown.reference).toBe(100);
  });

  it('folio del CFDI aparece en descripción del txn → bonus', () => {
    const s = scoreMatch(
      txn({ description: 'SPEI OXXO FACT F-00047' }),
      inv({ folio: 'F-00047' }),
    );
    expect(s.breakdown.reference).toBe(100);
  });

  it('nombre del cliente aparece en descripción → bonus parcial', () => {
    const s = scoreMatch(
      txn({ description: 'TRANSF TORTAS LUPITA SA' }),
      inv({ clienteNombre: 'TORTAS LUPITA SA DE CV' }),
    );
    expect(s.breakdown.reference).toBeGreaterThanOrEqual(40);
  });

  it('sin referencia ni nombre match → reference 0', () => {
    const s = scoreMatch(txn(), inv({ clienteNombre: null }));
    expect(s.breakdown.reference).toBe(0);
  });
});

describe('reconcile batch', () => {
  it('matchea 1-a-1 monto+fecha exactos → auto', () => {
    const results = reconcile(
      [txn({ amount: 15000, sourceRow: 2 })],
      [inv({ uuid: 'u1', total: 15000 })],
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('auto');
    expect(results[0].invoice?.uuid).toBe('u1');
    expect(results[0].score).toBeGreaterThanOrEqual(90);
  });

  it('monto se desvía 10% → review (no auto)', () => {
    const results = reconcile(
      [txn({ amount: 16500 })],
      [inv({ total: 15000 })],
    );
    expect(results[0].status).toBe('review');
    expect(results[0].reason).toContain('monto');
  });

  it('ningún candidato razonable → unmatched', () => {
    const results = reconcile(
      [txn({ amount: 999999 })],
      [inv({ total: 100 })],
    );
    expect(results[0].status).toBe('unmatched');
    expect(results[0].invoice).toBeNull();
  });

  it('ambiguo: 2 CFDIs con mismo monto y fecha → review', () => {
    const results = reconcile(
      [txn({ amount: 15000 })],
      [
        inv({ uuid: 'u1', total: 15000, folio: 'F-A' }),
        inv({ uuid: 'u2', total: 15000, folio: 'F-B' }),
      ],
    );
    expect(results[0].status).toBe('review');
    expect(results[0].reason.toLowerCase()).toContain('ambig');
  });

  it('ambiguo se rompe por referencia → auto gana el que matchea', () => {
    const results = reconcile(
      [txn({ amount: 15000, reference: 'F-B' })],
      [
        inv({ uuid: 'u1', total: 15000, folio: 'F-A' }),
        inv({ uuid: 'u2', total: 15000, folio: 'F-B' }),
      ],
    );
    expect(results[0].status).toBe('auto');
    expect(results[0].invoice?.uuid).toBe('u2');
  });

  it('ignora CFDIs ya cobrados completamente', () => {
    const results = reconcile(
      [txn({ amount: 15000 })],
      [inv({ uuid: 'paid', total: 15000, paidSoFar: 15000 })],
    );
    expect(results[0].status).toBe('unmatched');
  });

  it('CFDIs fuera de ventana temporal se filtran', () => {
    const results = reconcile(
      [txn({ date: new Date(Date.UTC(2026, 8, 15)) })],
      [
        // Hace 90 días → fuera
        inv({ uuid: 'viejo', issuedAt: new Date(Date.UTC(2026, 5, 15)) }),
        // Mismo día → dentro
        inv({ uuid: 'bueno', issuedAt: new Date(Date.UTC(2026, 8, 15)) }),
      ],
    );
    expect(results[0].invoice?.uuid).toBe('bueno');
  });

  it('débitos (gastos) van a skipped, no se matchean', () => {
    const results = reconcile(
      [
        txn({ kind: 'credit', amount: 15000 }),
        txn({ kind: 'debit', amount: 250, description: 'COMISION', sourceRow: 3 }),
      ],
      [inv({ total: 15000 })],
    );
    expect(results).toHaveLength(1);
    expect(results[0].txn.kind).toBe('credit');
  });

  it('CFDI PPD con pago parcial sigue siendo elegible por el remanente', () => {
    const results = reconcile(
      [txn({ amount: 5000 })], // segundo pago parcial de 20k, ya se pagaron 15k
      [inv({ uuid: 'ppd', total: 20000, paidSoFar: 15000, metodoPago: 'PPD' })],
    );
    expect(results[0].invoice?.uuid).toBe('ppd');
    expect(results[0].status).toBe('auto');
  });
});
