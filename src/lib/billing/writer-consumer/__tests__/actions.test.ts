/**
 * actions.test.ts — verifica el switch por kind de resolveInvoiceAction
 * y resolveFatalAction. Sin dependencias externas: solo tipo puro.
 */
import { describe, it, expect } from 'vitest';
import { resolveInvoiceAction, resolveFatalAction } from '../actions';
import type { InvoiceResult, FatalReport, ErrorKind } from '../report';

function buildFailed(kind: ErrorKind, msg = 'human message'): InvoiceResult {
  return {
    index: 0,
    rfc: 'XAXX010101000',
    ok: false,
    serie: 'FTEN',
    folio: 0,
    uuid: null,
    timbradoPath: null,
    kind,
    humanMessage: msg,
    error: 'some technical detail',
  };
}

describe('resolveInvoiceAction', () => {
  it('returns noop for ok results', () => {
    const okResult: InvoiceResult = { ...buildFailed('other'), ok: true };
    expect(resolveInvoiceAction(okResult)).toEqual({ type: 'noop' });
  });

  it('rfcNotFound → reply_to_client', () => {
    const action = resolveInvoiceAction(buildFailed('rfcNotFound', 'RFC ghost'));
    expect(action).toEqual({ type: 'reply_to_client', humanMessage: 'RFC ghost', kind: 'rfcNotFound' });
  });

  it('skuNotFound → reply_to_client', () => {
    const action = resolveInvoiceAction(buildFailed('skuNotFound', 'SKU ghost'));
    expect(action).toEqual({ type: 'reply_to_client', humanMessage: 'SKU ghost', kind: 'skuNotFound' });
  });

  it('pacError → redeposit_pending', () => {
    const action = resolveInvoiceAction(buildFailed('pacError', 'PAC caído'));
    expect(action).toEqual({ type: 'redeposit_pending', reason: 'PAC caído' });
  });

  it.each<ErrorKind>(['invalidData', 'catalogAccess', 'other'])(
    '%s → escalate_to_nazre',
    (kind) => {
      const action = resolveInvoiceAction(buildFailed(kind, `msg for ${kind}`));
      expect(action).toEqual({ type: 'escalate_to_nazre', humanMessage: `msg for ${kind}`, kind });
    },
  );

  it('degrades to technical error when humanMessage is null', () => {
    const withoutHuman: InvoiceResult = { ...buildFailed('rfcNotFound'), humanMessage: null };
    const action = resolveInvoiceAction(withoutHuman);
    if (action.type !== 'reply_to_client') throw new Error('expected reply_to_client');
    expect(action.humanMessage).toBe('some technical detail');
  });
});

describe('resolveFatalAction', () => {
  it('always escalates', () => {
    const report: FatalReport = {
      sourceFile: 'malformed.xml',
      processedAt: '2026-09-04T00:00:00Z',
      fatalKind: 'invalidData',
      fatalMessage: 'schema no cumple',
      fatalError: 'InvalidDataException: ...',
    };
    expect(resolveFatalAction(report)).toEqual({
      type: 'escalate_to_nazre',
      humanMessage: 'schema no cumple',
      kind: 'invalidData',
    });
  });
});
