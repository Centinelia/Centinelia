// Regression tests para el cron cleanup-analytics.
//
// Bug 2026-10-10 (alerta recibida 2026-10-12): el cron hardcodeaba
// `.select('id').in('id', ids)` para todas las tablas. stripe_webhook_events
// usa `event_id` como PK → 42703 "column stripe_webhook_events.id does not
// exist" → cleanup parcial 4/5 → alerta recurrente a notificaciones@centinelia.mx.
//
// Fix sistémico: hacer `pk_column` REQUIRED en el type para que agregar un
// rule nuevo sin declarar PK sea compile-error. Ver [[feedback-fixes-para-siempre]].

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockRpc, selectCalls, deleteInCalls } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc:  vi.fn(),
  selectCalls:   [] as Array<{ table: string; column: string }>,
  deleteInCalls: [] as Array<{ table: string; column: string; ids: unknown[] }>,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: () => true,
}));

vi.mock('@/lib/cron/alert-partial-failure', () => ({
  alertCronPartialFailure: vi.fn(),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

function wireMocks() {
  mockFrom.mockReset();
  mockRpc.mockReset();
  selectCalls.length = 0;
  deleteInCalls.length = 0;
  mockRpc.mockResolvedValue({ data: 0, error: null });

  mockFrom.mockImplementation((table: string) => ({
    select: (col: string) => {
      selectCalls.push({ table, column: col });
      return {
        lt: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
    delete: () => ({
      in: (col: string, ids: unknown[]) => {
        deleteInCalls.push({ table, column: col, ids });
        return {
          in: () => Promise.resolve({ error: null }),  // chained .in for platform_incidents
        };
      },
    }),
  }));
}

describe('cleanup-analytics — PK column por rule (fix 42703)', () => {
  beforeEach(() => {
    wireMocks();
    vi.resetModules();
  });

  it('RULES declara pk_column no vacío para cada entrada (compile-time + runtime)', async () => {
    const { RULES } = await import('../route');
    expect(RULES.length).toBeGreaterThan(0);
    for (const r of RULES) {
      expect(r.pk_column, `rule ${r.table} sin pk_column`).toBeTruthy();
      expect(typeof r.pk_column).toBe('string');
      expect(r.column, `rule ${r.table} sin column`).toBeTruthy();
    }
  });

  it('stripe_webhook_events usa event_id (NO id) como PK', async () => {
    const { RULES } = await import('../route');
    const stripeRule = RULES.find(r => r.table === 'stripe_webhook_events');
    expect(stripeRule).toBeDefined();
    expect(stripeRule!.pk_column).toBe('event_id');
  });

  it('al correr el cron, el SELECT de stripe_webhook_events pide event_id (no id)', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://x/api/cron/cleanup-analytics', { headers: { Authorization: 'Bearer test' } });
    await GET(req);

    const stripeSelect = selectCalls.find(c => c.table === 'stripe_webhook_events');
    expect(stripeSelect).toBeDefined();
    expect(stripeSelect!.column).toBe('event_id');
    expect(stripeSelect!.column).not.toBe('id');  // guard explícito contra la regresión original
  });

  it('tablas con PK normal siguen usando id (regresión inversa)', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://x/api/cron/cleanup-analytics', { headers: { Authorization: 'Bearer test' } });
    await GET(req);

    for (const table of ['llm_call_log', 'tool_call_log', 'platform_incidents']) {
      const sel = selectCalls.find(c => c.table === table);
      expect(sel, `select on ${table} no se hizo`).toBeDefined();
      expect(sel!.column).toBe('id');
    }
  });
});
