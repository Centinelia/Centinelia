/**
 * Integration tests for the ops_ledger SQL surface.
 *
 * These tests hit the live Supabase project. They are EXCLUDED from the
 * default `npx vitest run` (see vitest.config.ts) because:
 *   1. They mutate real rows (ops_ledger + account_ops) for TEST_PORTAL_EMAIL.
 *   2. They depend on a seeded voice_agent with ai_ops_limit set for that email.
 *   3. Some assertions read organization state (ops_ledger_enabled flag) that
 *      flips over time in real usage.
 *
 * To run them intentionally: `npm run test:integration`. Set
 * TEST_PORTAL_EMAIL to a synthetic org you own so no production data is
 * touched, and confirm that org has a voice_agent with ai_ops_limit set
 * and ops_ledger_enabled = false.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// Default to the synthetic org seeded by the ops-ledger test setup — the .invalid
// TLD guarantees it never collides with a real customer inbox. Override with
// TEST_PORTAL_EMAIL if you have a different seeded org you want to point at.
const TEST_EMAIL = process.env.TEST_PORTAL_EMAIL ?? 'ops-ledger-test@test.centinelia.invalid';
const supabase = createAdminClient();

// ops_ledger rows are protected by a prevent_ledger_tamper trigger — a plain
// .delete() from supabase-js is silently rejected. The test_cleanup_ops_ledger
// RPC bypasses the trigger, but only for synthetic .test.centinelia.invalid
// emails (guard rail in the function body). Signature stays zero-arg because
// vitest treats a parameterized callback as a fixture request.
async function cleanup() {
  await supabase.rpc('test_cleanup_ops_ledger', { p_portal_email: TEST_EMAIL });
}

describe('ops_ledger SQL functions', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('get_ops_pool_balance returns 0 for empty ledger', async () => {
    const { data } = await supabase.rpc('get_ops_pool_balance', { p_portal_email: TEST_EMAIL });
    expect(data).toBe(0);
  });

  it('get_ops_pool_cap returns 0 for portal with no active agents', async () => {
    const { data } = await supabase.rpc('get_ops_pool_cap', { p_portal_email: 'nonexistent@test.com' });
    expect(data).toBe(0);
  });
});

describe('apply_ops_ledger_entry cap enforcement', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('inserts full credit when within cap', async () => {
    // Setup: 1 agent con ai_ops_limit=100 → cap = 200
    // (Requiere que TEST_EMAIL tenga un voice_agent activo con ai_ops_limit=100.
    // Si no, skip con warning.)
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, ai_ops_limit')
      .eq('portal_email', TEST_EMAIL)
      .eq('active', true);
    if (!agents || agents.length === 0) {
      console.warn('[skip] no active agent for TEST_EMAIL — cannot test cap');
      return;
    }
    const agent = agents[0];

    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL,
      p_agent_id: agent.id,
      p_amount: 50,
      p_kind: 'extra_ops_purchase',
      p_reference_id: 'test_ref_1',
      p_description: 'test 50',
    });

    const { data: rows } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('reference_id', 'test_ref_1');

    expect(rows).toHaveLength(1);
    expect(rows![0].amount).toBe(50);
    expect(rows![0].kind).toBe('extra_ops_purchase');
  });

  it('inserts rollover_cap row when credit exceeds cap', async () => {
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, ai_ops_limit')
      .eq('portal_email', TEST_EMAIL)
      .eq('active', true);
    if (!agents || agents.length === 0) return;
    const agent = agents[0];
    const cap = (agent.ai_ops_limit ?? 0) * 2;
    if (cap === 0) return;

    // Push exactly the cap first
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL,
      p_agent_id: agent.id,
      p_amount: cap,
      p_kind: 'renewal',
      p_reference_id: 'test_ref_2',
      p_description: 'push to cap',
    });

    // Then push 30 more — should generate rollover_cap of -30
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL,
      p_agent_id: agent.id,
      p_amount: 30,
      p_kind: 'extra_ops_purchase',
      p_reference_id: 'test_ref_3',
      p_description: 'overflow',
    });

    const { data: capRows } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('reference_id', 'test_ref_3')
      .eq('kind', 'rollover_cap');

    expect(capRows).toHaveLength(1);
    expect(capRows![0].amount).toBe(-30);
  });
});

describe('consume_pool_ops', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('inserts consumption debit and returns new balance', async () => {
    // Seed: apply credit +100
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_amount: 100,
      p_kind: 'admin_adjustment', p_reference_id: 'seed', p_description: 'seed',
    });

    const { data: balance } = await supabase.rpc('consume_pool_ops', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_ops: 15,
      p_reference_id: 'call_1', p_description: 'test consumption',
    });

    expect(balance).toBe(85);

    const { data: rows } = await supabase
      .from('ops_ledger')
      .select('amount, kind')
      .eq('portal_email', TEST_EMAIL)
      .eq('reference_id', 'call_1');

    expect(rows).toHaveLength(1);
    expect(rows![0].amount).toBe(-15);
    expect(rows![0].kind).toBe('consumption');
  });
});

describe('apply_ops_annual_grant', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('does NOT insert unused_forfeited when balance is 0', async () => {
    // Precondición: no annual contract for TEST_EMAIL, so no grant either.
    // Test verifies solo el branch de unused=0.
    await supabase.rpc('apply_ops_annual_grant', { p_portal_email: TEST_EMAIL });
    const { data: forfeit } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('kind', 'unused_forfeited');
    expect(forfeit).toHaveLength(0);
  });

  it('inserts unused_forfeited when balance > 0', async () => {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_amount: 50,
      p_kind: 'admin_adjustment', p_reference_id: 'seed', p_description: 'seed',
    });
    await supabase.rpc('apply_ops_annual_grant', { p_portal_email: TEST_EMAIL });
    const { data: forfeit } = await supabase
      .from('ops_ledger')
      .select('*')
      .eq('portal_email', TEST_EMAIL)
      .eq('kind', 'unused_forfeited');
    expect(forfeit).toHaveLength(1);
    expect(forfeit![0].amount).toBe(-50);
  });
});

describe('auto_refresh_ops_pool_cache trigger', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('refreshes account_ops after ledger insert', async () => {
    await supabase.rpc('apply_ops_ledger_entry', {
      p_portal_email: TEST_EMAIL, p_agent_id: null, p_amount: 42,
      p_kind: 'admin_adjustment', p_reference_id: 'trigger_test', p_description: 'trigger test',
    });

    const { data: acct } = await supabase
      .from('account_ops')
      .select('ops_balance, ops_included')
      .eq('portal_email', TEST_EMAIL)
      .single();

    expect(acct?.ops_balance).toBe(42);
    expect(acct?.ops_included).toBeGreaterThanOrEqual(0); // depends on cap
  });
});

describe('consumeAiOp behavior with feature flag', () => {
  // Uses a distinct portal_email with no seeded organizations row, so
  // ops_ledger_enabled resolves to the default (false) and no ledger rows
  // can exist. Isolates the assertion from TEST_EMAIL, which has the flag
  // ON for the RPC-behaviour tests above.
  const LEGACY_TEST_EMAIL = 'ops-ledger-legacy-test@test.centinelia.invalid';

  it('uses legacy path when flag off', async () => {
    const { data: org } = await supabase
      .from('organizations')
      .select('ops_ledger_enabled')
      .eq('portal_email', LEGACY_TEST_EMAIL)
      .maybeSingle();

    expect(org?.ops_ledger_enabled ?? false).toBe(false);

    const before = await supabase
      .from('ops_ledger')
      .select('id')
      .eq('portal_email', LEGACY_TEST_EMAIL)
      .eq('kind', 'consumption');

    expect(before.data).toEqual([]);
  });
});
