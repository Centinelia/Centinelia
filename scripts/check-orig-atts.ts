import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('attachments')
    .eq('id', 'c9717094-1b17-406e-b928-082bba9ca174')
    .single();
  const r = data as any;
  console.log('attachments:', JSON.stringify(r.attachments, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
