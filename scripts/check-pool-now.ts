import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: org } = await sb.from('organizations').select('monthly_ops_pool, monthly_ops_used, overage_ops, pool_reset_date').eq('portal_email', 'camila@acproyectos.com').single();
  console.log('pool:', JSON.stringify(org));
  // Check ops_ledger recent
  const { data: led } = await sb.from('ai_ops_log').select('created_at, count, reference_id')
    .eq('portal_email', 'camila@acproyectos.com')
    .gte('created_at', '2026-10-08T18:00:00Z')
    .order('created_at', { ascending: false }).limit(5);
  console.log('\nledger recent:');
  for (const l of (led ?? []) as any[]) console.log(` [${l.created_at.slice(11, 23)}] count=${l.count} ref=${l.reference_id?.slice(0, 50)}`);
}
main().catch(e => console.error(e));
