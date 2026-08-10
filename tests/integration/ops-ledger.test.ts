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
