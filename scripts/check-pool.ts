import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: org } = await sb.from('organizations').select('monthly_ops_pool, monthly_ops_used, overage_ops, pool_reset_date, suspended_at, warned_at')
    .eq('portal_email', 'camila@acproyectos.com').single();
  console.log('pool:', JSON.stringify(org, null, 2));
}
main().catch(e => console.error(e));
