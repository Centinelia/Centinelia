import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: one } = await sb.from('organizations').select('*').limit(1);
  if (one?.[0]) console.log('cols:', Object.keys(one[0]).join(', '));
}
main().catch(e => console.error(e));
