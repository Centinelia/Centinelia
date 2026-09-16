// Regression test para fix ops-guard.ts path LEGACY sync insert (2026-09-15).
//
// Bug: el path LEGACY (annual_prepaid con ops_ledger_enabled=false) escribía
// a ai_ops_log dentro de `after()` de next/server. Vercel podía cortar la
// función antes de completar el INSERT → row perdida = charge sin fila en
// historial de consumo.
//
// Fix: sync try/catch, mismo patrón que Path NEW línea 76.
//
// Valida que consumeAiOp(agent, count) — cuando el portal tiene
// ops_ledger_enabled=false y consumePoolOps consume — inserta a ai_ops_log
// ANTES de resolver la promise. Sin este fix, con after() el mock de insert
// nunca se llamaba en ambiente de test (throw fuera de request context) y en
// prod se perdía en timeout Vercel.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsertAiOpsLog, mockConsumePoolOps } = vi.hoisted(() => ({
  mockInsertAiOpsLog: vi.fn(),
  mockConsumePoolOps: vi.fn(),
}));

vi.mock('next/server', () => ({
  // Detector: si el fix regresa a after(), el test falla porque el insert
  // real no se llamó, o Next tira porque no hay request context.
  after: vi.fn(() => {
    throw new Error('after() no debe usarse para ai_ops_log (audit gap)');
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'voice_agents') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { portal_email: 'client@example.com' } }),
            }),
          }),
        };
      }
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { ops_ledger_enabled: false } }),
            }),
          }),
        };
      }
      if (table === 'ai_ops_log') {
        return {
          insert: async (row: unknown) => {
            mockInsertAiOpsLog(row);
            return { error: null };
          },
        };
      }
      return {};
    },
    rpc: vi.fn(),
  }),
}));

vi.mock('@/lib/annual-contracts/pool-consume', () => ({
  consumePoolOps: mockConsumePoolOps,
  fireOverageAlertIfNeeded: vi.fn(),
}));

vi.mock('@/lib/billing/auto-refill', () => ({
  executeAutoRefillOps: vi.fn(),
}));

beforeEach(() => {
  mockInsertAiOpsLog.mockReset();
  mockConsumePoolOps.mockReset();
});

describe('consumeAiOp — path LEGACY sync ai_ops_log insert', () => {
  it('inserta la fila en ai_ops_log ANTES de resolver la promise (no after())', async () => {
    mockConsumePoolOps.mockResolvedValue({
      consumed: true,
      minutes_used_after: 5,
      minutes_pool: 100,
      crossed_100_threshold: false,
      crossed_120_threshold: false,
    });

    const { consumeAiOp } = await import('../ops-guard');
    const result = await consumeAiOp('agent-legacy-1', 1, {
      source: 'test_legacy',
      label:  'Test legacy path',
    });

    expect(result.ok).toBe(true);
    // El insert debió ocurrir dentro del await, sin depender de after().
    expect(mockInsertAiOpsLog).toHaveBeenCalledOnce();
    expect(mockInsertAiOpsLog).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id:     'agent-legacy-1',
        portal_email: 'client@example.com',
        source:       'test_legacy',
        count:        1,
      }),
    );
  });

  it('no aborta el flow si el insert falla (log-y-sigue)', async () => {
    mockConsumePoolOps.mockResolvedValue({
      consumed: true,
      minutes_used_after: 5,
      minutes_pool: 100,
      crossed_100_threshold: false,
      crossed_120_threshold: false,
    });
    mockInsertAiOpsLog.mockImplementation(() => {
      throw new Error('supabase down');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { consumeAiOp } = await import('../ops-guard');
    // Debe resolver sin throw — el side-effect del pool ya ocurrió; drift
    // detector es la red de seguridad.
    const result = await consumeAiOp('agent-legacy-2', 1, { source: 'test_legacy_err' });
    expect(result.ok).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
