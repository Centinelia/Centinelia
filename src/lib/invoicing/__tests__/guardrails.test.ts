import { describe, it, expect, vi } from 'vitest';
import { evaluateGuardrails } from '../guardrails';

function mockSb(perHour: number, perDay: number) {
  let n = 0;
  return {
    from: vi.fn().mockImplementation(() => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockImplementation(() => {
          const c = n === 0 ? perHour : perDay;
          n++;
          return Promise.resolve({ count: c, error: null });
        }),
      };
    }),
  } as any;
}

const LIMITS = {
  monto_max_mxn: 50000,
  blocked_uso_cfdi: ['D01','D02','D03','D04','D05','D06','D07','D08','D09','D10'],
  max_stamps_per_day: 50,
  max_stamps_per_hour_per_rfc: 3,
};

describe('evaluateGuardrails', () => {
  it('pasa si monto ok, uso ok, rates ok', async () => {
    const r = await evaluateGuardrails(
      { total: 1000, uso_cfdi: 'G03', cliente_rfc: 'XAXX010101000', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 0),
    );
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it('bloquea si monto excede tope', async () => {
    const r = await evaluateGuardrails(
      { total: 100000, uso_cfdi: 'G03', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 0),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons[0]).toMatch(/monto/i);
  });
  it('bloquea si uso CFDI está en blocked list', async () => {
    const r = await evaluateGuardrails(
      { total: 100, uso_cfdi: 'D01', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 0),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some(x => x.includes('D01'))).toBe(true);
  });
  it('bloquea si rate hora al mismo RFC excedido', async () => {
    const r = await evaluateGuardrails(
      { total: 100, uso_cfdi: 'G03', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(3, 10),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some(x => x.match(/última hora/i))).toBe(true);
  });
  it('bloquea si rate diario global excedido', async () => {
    const r = await evaluateGuardrails(
      { total: 100, uso_cfdi: 'G03', cliente_rfc: 'X', portal_email: 'a@b.c' },
      LIMITS, mockSb(0, 50),
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some(x => x.match(/diario/i))).toBe(true);
  });
});
