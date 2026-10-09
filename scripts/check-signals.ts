import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox').select('status, auto_mode_decision, auto_mode_reason, auto_mode_signals').eq('id', '84b2d1b7-f3b2-4e56-967f-35d33d61e323').single();
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
