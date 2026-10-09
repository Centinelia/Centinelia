// Tests de consumeAiOp (post-eliminación del path legacy, 2026-10-09).
// Fuente única = ops_ledger. Ver .brain/decisions/2026-10-09-ops-ledger-fuente-unica.md
//
// Garantías cubiertas:
// 1. ai_ops_log se inserta SÍNCRONAMENTE (no via after()) para no perder audit
//    rows por Vercel container termination. Ver bug 2026-09-15 fix original.
// 2. Si consume_pool_ops RPC falla, se logea error + se deja audit row con
//    count=0 + rpc_error en context (bug 2026-09-29 Nelia/Tortillería).
// 3. Si no hay portal_email (agente huérfano), devuelve ok=false sin cobrar.
// 4. Auto-refill por threshold sigue disparándose vía after() cuando aplica.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsertAiOpsLog, mockRpc, mockAfterCallbacks, mockExecuteAutoRefill } = vi.hoisted(() => ({
  mockInsertAiOpsLog:    vi.fn(),
  mockRpc:               vi.fn(),
  mockAfterCallbacks:    [] as Array<() => Promise<void> | void>,
  mockExecuteAutoRefill: vi.fn(),
}));

vi.mock('next/server', () => ({
  // after(): recoge callbacks sin ejecutarlas automáticamente. Esto permite al
  // test verificar (a) qué se llamó ANTES del after() (sync, p.ej. audit log)
  // y (b) ejecutar manualmente las callbacks diferidas (auto-refill).
  after: (cb: () => Promise<void> | void) => {
    mockAfterCallbacks.push(cb);
  },
}));

vi.mock('@/lib/billing/auto-refill', () => ({
  executeAutoRefillOps: mockExecuteAutoRefill,
}));

vi.mock('@/lib/annual-contracts/pool-consume', () => ({
  // Legacy — ya no se usa en consumeAiOp pero sigue importado por chargeOrgDirectly.
  consumePoolOps:          vi.fn(),
  fireOverageAlertIfNeeded: vi.fn(),
}));

function makeSupabaseMock(opts: {
  portalEmail?: string | null;
  account?: { ops_used: number; ops_included: number } | null;
  agentCfg?: { auto_refill_ops_enabled?: boolean; auto_refill_ops_threshold?: number; stripe_customer_id?: string | null };
}) {
  return () => ({
    from: (table: string) => {
      if (table === 'voice_agents') {
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { portal_email: opts.portalEmail ?? null } }),
              single:      async () => ({ data: opts.agentCfg ?? {} }),
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
              maybeSingle: async () => ({ data: opts.account ?? null }),
            }),
          }),
        };
      }
      return {};
    },
    rpc: (fn: string, args: unknown) => mockRpc(fn, args),
  });
}

beforeEach(() => {
  mockInsertAiOpsLog.mockReset();
  mockRpc.mockReset();
  mockExecuteAutoRefill.mockReset();
  mockExecuteAutoRefill.mockResolvedValue(undefined);
  mockAfterCallbacks.length = 0;
  vi.resetModules();
});

describe('consumeAiOp — path único via ops_ledger', () => {
  it('inserta en ai_ops_log SÍNCRONAMENTE antes de resolver (no via after())', async () => {
    mockRpc.mockResolvedValue({ data: 98, error: null });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: makeSupabaseMock({
        portalEmail: 'client@example.com',
        account:     { ops_used: 2, ops_included: 100 },
      }),
    }));

    const { consumeAiOp } = await import('../ops-guard');
    const result = await consumeAiOp('agent-ok', 1, {
      source: 'incident_registered',
      label:  'Test audit sync',
    });

    expect(result.ok).toBe(true);
    // El insert debió haberse completado antes de retornar, independiente de after()
    expect(mockInsertAiOpsLog).toHaveBeenCalledOnce();
    expect(mockInsertAiOpsLog).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id:     'agent-ok',
        portal_email: 'client@example.com',
        source:       'incident_registered',
        count:        1,
      }),
    );
  });

  it('cuando consume_pool_ops RPC falla, logea error y deja audit row con count=0 + rpc_error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'trigger cascade failed', code: 'P0001' } });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: makeSupabaseMock({ portalEmail: 'client@example.com' }),
    }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { consumeAiOp } = await import('../ops-guard');
    const result = await consumeAiOp('agent-fail', 2, {
      source: 'incidencia_notif',
      reference_id: 'incident-abc',
    });

    expect(result.ok).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ops-guard] consume_pool_ops RPC failed (undercharge):',
      expect.objectContaining({
        agentId: 'agent-fail',
        count: 2,
        source: 'incidencia_notif',
        reference_id: 'incident-abc',
      }),
    );
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

  it('cuando no hay portal_email, devuelve ok=false sin cobrar (agente huérfano)', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: makeSupabaseMock({ portalEmail: null }),
    }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { consumeAiOp } = await import('../ops-guard');
    const result = await consumeAiOp('agent-huerfano', 1, { source: 'test' });

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ops-guard] consumeAiOp sin portal_email (agente huérfano):',
      expect.objectContaining({ agentId: 'agent-huerfano', count: 1 }),
    );
    consoleSpy.mockRestore();
  });

  it('auto-refill se dispara vía after() al cruzar el threshold', async () => {
    // Antes: balance = 50 + 1 = 51 (prevBalance). Threshold = 50. Balance = 50
    // ⇒ prevBalance(51) >= 50 && balance(50) < 50 es FALSE porque 50 no es < 50.
    // Usamos count=2: prev=52, balance=50 → sigue sin cruzar.
    // Para que cruce: count=5, balance=47, prev=52, threshold=50 → prev>=50, balance<50 ✓
    mockRpc.mockResolvedValue({ data: 47, error: null });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: makeSupabaseMock({
        portalEmail: 'client@example.com',
        account:     { ops_used: 53, ops_included: 100 },
        agentCfg:    { auto_refill_ops_enabled: true, auto_refill_ops_threshold: 50, stripe_customer_id: 'cus_x' },
      }),
    }));

    const { consumeAiOp } = await import('../ops-guard');
    await consumeAiOp('agent-threshold', 5, { source: 'test' });

    // after() callback acumulada
    expect(mockAfterCallbacks).toHaveLength(1);
    // Ejecuta el callback diferido manualmente
    await mockAfterCallbacks[0]();
    expect(mockExecuteAutoRefill).toHaveBeenCalledWith('agent-threshold');
  });

  it('auto-refill NO se dispara si auto_refill_ops_enabled=false', async () => {
    mockRpc.mockResolvedValue({ data: 47, error: null });
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: makeSupabaseMock({
        portalEmail: 'client@example.com',
        account:     { ops_used: 53, ops_included: 100 },
        agentCfg:    { auto_refill_ops_enabled: false, auto_refill_ops_threshold: 50, stripe_customer_id: 'cus_x' },
      }),
    }));

    const { consumeAiOp } = await import('../ops-guard');
    await consumeAiOp('agent-no-refill', 5, { source: 'test' });

    await mockAfterCallbacks[0]?.();
    expect(mockExecuteAutoRefill).not.toHaveBeenCalled();
  });
});
