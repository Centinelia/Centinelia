import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('email_body, email_subject')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .ilike('email_subject', '%Procesa Backlog%')
    .single();
  const r = data as any;
  console.log(`subject: ${r.email_subject}`);
  console.log(`body:`);
  console.log(r.email_body);
}
main().catch(e => { console.error(e); process.exit(1); });
