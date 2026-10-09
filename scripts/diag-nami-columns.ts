import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox').select('*').limit(1);
  if (data && data[0]) console.log('Columns:', Object.keys(data[0]).join(', '));
}
main().catch(e => console.error(e));
