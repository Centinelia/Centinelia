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

const { mockInsertAiOpsLog, mockConsumePoolOps, mockRpc } = vi.hoisted(() => ({
  mockInsertAiOpsLog: vi.fn(),
  mockConsumePoolOps: vi.fn(),
  mockRpc:            vi.fn(),
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

// Regresión para el bug 2026-09-29 (Nelia/Tortillería): en el path NEW
// (ops_ledger_enabled=true) si consume_pool_ops RPC devolvía error, la
// función retornaba silently y NO se logueaba nada NI se dejaba audit row.
// Undercharge invisible que rompía pool accuracy.
describe('consumeAiOp — path NEW error handling (bug 2026-09-29)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    // Recablear el mock de supabase para path NEW: ops_ledger_enabled=true
    // y rpc controlable por test. Requiere resetModules para que la nueva
    // vi.mock aplique al re-import.
    vi.resetModules();
    vi.doMock('@/lib/supabase/admin', () => ({
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
                  maybeSingle: async () => ({ data: { ops_ledger_enabled: true } }),
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
          if (table === 'account_ops') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ops_used: 0, ops_included: 100 } }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: (fn: string, args: unknown) => mockRpc(fn, args),
      }),
    }));
  });

  it('cuando consume_pool_ops falla, logea error y deja audit row con count=0', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'trigger cascade failed', code: 'P0001' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { consumeAiOp } = await import('../ops-guard');
    const result = await consumeAiOp('agent-new-fail', 2, {
      source: 'incidencia_notif',
      label:  'Aviso de queja al encargado por correo (2 recipients)',
      reference_id: 'incident-abc',
    });

    // Retorna ok:false (RPC falló) pero NO throw
    expect(result.ok).toBe(false);
    // Loguea el error para ser visible en Vercel
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ops-guard] consume_pool_ops RPC failed (undercharge):',
      expect.objectContaining({
        agentId: 'agent-new-fail',
        count: 2,
        source: 'incidencia_notif',
        reference_id: 'incident-abc',
      }),
    );
    // Deja audit row con count=0 y rpc_error en context — clave para
    // que el drift detector vea el intento fallido.
    expect(mockInsertAiOpsLog).toHaveBeenCalledOnce();
    const auditRow = mockInsertAiOpsLog.mock.calls[0][0] as {
      count: number; source: string; reference_id: string; context: string;
    };
    expect(auditRow.count).toBe(0);
    expect(auditRow.source).toBe('incidencia_notif');
    expect(auditRow.reference_id).toBe('incident-abc');
    const ctx = JSON.parse(auditRow.context);
    expect(ctx.rpc_error).toContain('trigger cascade failed');
    expect(ctx.intended_count).toBe(2);
    consoleSpy.mockRestore();
  });

  it('cuando el RPC es exitoso, sigue insertando el audit row normal (regresión inversa)', async () => {
    mockRpc.mockResolvedValue({ data: 98, error: null });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { consumeAiOp } = await import('../ops-guard');
    const result = await consumeAiOp('agent-new-ok', 1, {
      source: 'incident_registered',
      label:  'Registro de queja',
      reference_id: 'incident-xyz',
    });

    expect(result.ok).toBe(true);
    // Path exitoso NO debe logear el nuevo error
    expect(consoleSpy).not.toHaveBeenCalledWith(
      '[ops-guard] consume_pool_ops RPC failed (undercharge):',
      expect.anything(),
    );
    // Audit row normal, count=1
    expect(mockInsertAiOpsLog).toHaveBeenCalledOnce();
    const auditRow = mockInsertAiOpsLog.mock.calls[0][0] as { count: number; source: string };
    expect(auditRow.count).toBe(1);
    expect(auditRow.source).toBe('incident_registered');
    consoleSpy.mockRestore();
  });
});
