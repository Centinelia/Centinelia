/**
 * pool-charge.test.ts — Tests para el wrapper unificado de cobro al pool.
 *
 * Mockeamos consumeAiOp (from ops-guard) y el kill switch (via voice_agents
 * lookup). Verificamos:
 *   - withPoolCharge cobra 1 op cuando kill switch = true
 *   - withPoolCharge NO cobra cuando kill switch = false (rollout gradual)
 *   - withPoolCharge NO cobra si fn tira (side-effect no ocurrió)
 *   - withBatchedPoolCharge cobra count = N cuando fn devuelve N
 *   - withBatchedPoolCharge NO cobra cuando count = 0
 *   - chargePool cobra directo N ops
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() se hoista al top del archivo, así que la factory no puede
// referenciar variables de módulo. Usamos hoisted() para expose los mocks.
const { mockConsumeAiOp, mockFeatureLookup } = vi.hoisted(() => ({
  mockConsumeAiOp:   vi.fn(),
  mockFeatureLookup: vi.fn(),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mockConsumeAiOp,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => mockFeatureLookup(),
        }),
      }),
    }),
  }),
}));

import {
  withPoolCharge,
  withBatchedPoolCharge,
  chargePool,
  _clearPoolChargeFeatureCache,
} from '../pool-charge';

beforeEach(() => {
  mockConsumeAiOp.mockReset().mockResolvedValue({ ok: true, used: 1, limit: 100 });
  mockFeatureLookup.mockReset();
  _clearPoolChargeFeatureCache();
});

describe('withPoolCharge', () => {
  it('cobra 1 op cuando kill switch está activo y fn tiene éxito', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: { nala_pool_charge_enabled: true } } });
    const fn = vi.fn().mockResolvedValue('result');
    const result = await withPoolCharge(
      { agentId: 'agent-1', source: 'test', label: 'Test op' },
      fn,
    );
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledOnce();
    expect(mockConsumeAiOp).toHaveBeenCalledOnce();
    expect(mockConsumeAiOp).toHaveBeenCalledWith('agent-1', 1, expect.objectContaining({
      source: 'test',
      label:  'Test op',
    }));
  });

  it('NO cobra cuando kill switch está apagado', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: {} } });
    const fn = vi.fn().mockResolvedValue('result');
    await withPoolCharge({ agentId: 'agent-1', source: 'test' }, fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });

  it('NO cobra cuando el agente no existe', async () => {
    mockFeatureLookup.mockResolvedValue({ data: null });
    const fn = vi.fn().mockResolvedValue('result');
    await withPoolCharge({ agentId: 'ghost', source: 'test' }, fn);
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });

  it('NO cobra si fn tira', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: { nala_pool_charge_enabled: true } } });
    const fn = vi.fn().mockRejectedValue(new Error('side effect failed'));
    await expect(withPoolCharge({ agentId: 'agent-1', source: 'test' }, fn)).rejects.toThrow();
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });
});

describe('withBatchedPoolCharge', () => {
  it('cobra count = N cuando fn devuelve N', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: { nala_pool_charge_enabled: true } } });
    const result = await withBatchedPoolCharge(
      { agentId: 'agent-1', source: 'nala_vision_extract', label: 'Leer notita' },
      async () => ({ count: 4, result: 'ok' }),
    );
    expect(result).toBe('ok');
    expect(mockConsumeAiOp).toHaveBeenCalledOnce();
    expect(mockConsumeAiOp).toHaveBeenCalledWith('agent-1', 4, expect.objectContaining({
      source: 'nala_vision_extract',
    }));
  });

  it('NO cobra cuando count = 0', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: { nala_pool_charge_enabled: true } } });
    await withBatchedPoolCharge(
      { agentId: 'agent-1', source: 'test' },
      async () => ({ count: 0, result: 'empty' }),
    );
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });

  it('respeta kill switch aún con count > 0', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: { nala_pool_charge_enabled: false } } });
    await withBatchedPoolCharge(
      { agentId: 'agent-1', source: 'test' },
      async () => ({ count: 3, result: 'x' }),
    );
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });
});

describe('chargePool', () => {
  it('cobra directamente N ops', async () => {
    mockFeatureLookup.mockResolvedValue({ data: { features: { nala_pool_charge_enabled: true } } });
    await chargePool({ agentId: 'agent-1', source: 'nala_pac_timbre', label: 'Timbrado' }, 2);
    expect(mockConsumeAiOp).toHaveBeenCalledWith('agent-1', 2, expect.any(Object));
  });

  it('no-op cuando count <= 0', async () => {
    await chargePool({ agentId: 'agent-1', source: 'test' }, 0);
    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });
});
