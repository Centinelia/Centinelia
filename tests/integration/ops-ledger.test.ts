import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

const TEST_EMAIL = process.env.TEST_PORTAL_EMAIL ?? 'centinelia.dev@gmail.com';
const supabase = createAdminClient();

async function cleanup() {
  await supabase.from('ops_ledger').delete().eq('portal_email', TEST_EMAIL);
  await supabase.from('account_ops').delete().eq('portal_email', TEST_EMAIL);
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
