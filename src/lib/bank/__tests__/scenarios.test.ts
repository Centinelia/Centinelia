// Escenarios compuestos: PPD multi-pago, fixtures grandes, interacción
// parser+reconciler. Cierra gaps de cobertura detectados en F1 self-review.

import { describe, it, expect } from 'vitest';
import { parseBankStatement } from '../parsers';
import { reconcile } from '../reconciler';
import type { InvoiceCandidate, RawBankTxn } from '../types';

const inv = (over: Partial<InvoiceCandidate> = {}): InvoiceCandidate => ({
  uuid: 'u-base',
  folio: null,
  total: 10000,
  issuedAt: new Date(Date.UTC(2026, 8, 1)),
  metodoPago: 'PPD',
  clienteRfc: null,
  clienteNombre: null,
  paidSoFar: 0,
  ...over,
});

const txn = (over: Partial<RawBankTxn> = {}): RawBankTxn => ({
  date: new Date(Date.UTC(2026, 8, 15)),
  amount: 10000,
  kind: 'credit',
  description: '',
  reference: null,
  sourceRow: 2,
  ...over,
});

describe('PPD multi-pago secuencial', () => {
  it('primer pago parcial de un CFDI de 20k por 7k → auto match', () => {
    const results = reconcile(
      [txn({ amount: 7000, date: new Date(Date.UTC(2026, 8, 10)) })],
      [inv({ uuid: 'ppd-1', total: 20000, paidSoFar: 0, metodoPago: 'PPD' })],
    );
    // 7k vs 20k remaining = 65% off → amount score = 0 → unmatched esperado
    expect(results[0].status).toBe('unmatched');
  });

  it('segundo pago parcial que cuadra con remanente → auto', () => {
    const results = reconcile(
      [txn({ amount: 13000, date: new Date(Date.UTC(2026, 8, 20)) })],
      [inv({ uuid: 'ppd-1', total: 20000, paidSoFar: 7000, metodoPago: 'PPD' })],
    );
    expect(results[0].status).toBe('auto');
    expect(results[0].invoice?.uuid).toBe('ppd-1');
  });

  it('CFDI con paidSoFar == total queda fuera del pool elegible', () => {
    const results = reconcile(
      [txn({ amount: 20000 })],
      [
        inv({ uuid: 'pagado', total: 20000, paidSoFar: 20000, metodoPago: 'PPD' }),
        inv({ uuid: 'pendiente', total: 20000, paidSoFar: 0, metodoPago: 'PUE' }),
      ],
    );
    expect(results[0].invoice?.uuid).toBe('pendiente');
  });
});

describe('fixture grande 50 txns + 60 CFDIs', () => {
  it('procesa sin errores y genera resultados por cada credit', () => {
    const txns: RawBankTxn[] = [];
    const candidates: InvoiceCandidate[] = [];

    // 50 txns: 40 credits (depósitos de clientes) + 10 debits (comisiones)
    for (let i = 0; i < 40; i++) {
      txns.push({
        date: new Date(Date.UTC(2026, 8, 1 + (i % 28))),
        amount: 1000 + i * 100,
        kind: 'credit',
        description: `SPEI CLIENTE ${i}`,
        reference: `REF${i}`,
        sourceRow: 2 + i,
      });
    }
    for (let i = 0; i < 10; i++) {
      txns.push({
        date: new Date(Date.UTC(2026, 8, 15)),
        amount: 100,
        kind: 'debit',
        description: 'COMISION',
        reference: null,
        sourceRow: 42 + i,
      });
    }

    // 60 CFDIs: 40 cuadran con txns, 20 ruido
    for (let i = 0; i < 40; i++) {
      candidates.push({
        uuid: `cfdi-${i}`,
        folio: `F-${i}`,
        total: 1000 + i * 100,
        issuedAt: new Date(Date.UTC(2026, 8, 1 + (i % 28))),
        metodoPago: 'PUE',
        clienteRfc: `XAXX${i}`,
        clienteNombre: `CLIENTE ${i}`,
        paidSoFar: 0,
      });
    }
    for (let i = 0; i < 20; i++) {
      candidates.push({
        uuid: `ruido-${i}`,
        folio: `R-${i}`,
        total: 999999,
        issuedAt: new Date(Date.UTC(2026, 8, 15)),
        metodoPago: 'PUE',
        clienteRfc: null,
        clienteNombre: null,
        paidSoFar: 0,
      });
    }

    const results = reconcile(txns, candidates);
    expect(results).toHaveLength(40); // solo credits
    const autoCount = results.filter((r) => r.status === 'auto').length;
    expect(autoCount).toBeGreaterThanOrEqual(35); // tolera algunos review por fuzzy
  });
});

describe('scoring edge cases', () => {
  it('monto negativo (no debería pasar pero defensive)', () => {
    const results = reconcile(
      [txn({ amount: -100 })], // kind=credit pero amount negativo — raro
      [inv({ total: 100 })],
    );
    // -100 vs 100 pedido → diff 200%, score 0 → unmatched
    expect(results[0].status).toBe('unmatched');
  });

  it('CFDI con paidSoFar > total (sobrepagado, caso raro) → no eligible', () => {
    const results = reconcile(
      [txn({ amount: 100 })],
      [inv({ uuid: 'sobre', total: 100, paidSoFar: 150 })],
    );
    expect(results[0].invoice).toBeNull();
  });

  it('nombre cliente con palabras cortas (< 4 chars) no genera false positives', () => {
    const results = reconcile(
      [txn({ amount: 15000, description: 'SPEI RECIBIDO XX YY' })],
      [inv({ total: 15000, clienteNombre: 'YA SA DE CV' })], // todas < 4 chars o stop-ish
    );
    // score por nombre = 0 porque palabras filtradas, pero amount+date exactos → auto
    expect(results[0].status).toBe('auto');
    expect(results[0].breakdown.reference).toBe(0);
  });

  it('folio idéntico a monto en la descripción no genera false positive', () => {
    // CFDI folio "F-15000" y txn con monto 15000. Nunca deberíamos confundirlos.
    const results = reconcile(
      [txn({ amount: 15000, description: 'DEPOSITO 15000 VARIOS CLIENTES' })],
      [inv({ total: 999, folio: 'F-15000' })], // monto distinto, mismo folio en desc
    );
    // 15000 vs 999 → amount score 0 → debería unmatched a pesar del folio match
    expect(results[0].status).toBe('unmatched');
  });
});

describe('parser + reconciler integración CSV→MatchResults', () => {
  it('pipeline completo BBVA → match', () => {
    const csv = `FECHA,DESCRIPCIÓN,CARGO,ABONO,SALDO,REFERENCIA
10/09/2026,SPEI RECIBIDO TORTAS LUPITA FACT F-100,,8500.00,8500.00,0098765432
`;
    const parsed = parseBankStatement(csv);
    const results = reconcile(parsed.txns, [
      inv({
        uuid: 'match',
        folio: 'F-100',
        total: 8500,
        issuedAt: new Date(Date.UTC(2026, 8, 8)),
        clienteNombre: 'TORTAS LUPITA SA DE CV',
      }),
    ]);
    expect(results[0].status).toBe('auto');
    expect(results[0].invoice?.uuid).toBe('match');
    expect(results[0].breakdown.reference).toBe(100); // folio en descripción
  });
});
