import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_from, email_subject, status, sent_at')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-09T00:00:00')
    .order('created_at', { ascending: false })
    .limit(20);
  for (const r of (data ?? []) as any[]) {
    const sent = r.sent_at ? 'REPLIED' : '-';
    console.log(`[${r.created_at}] from=${r.email_from?.slice(0, 60)} status=${r.status} ${sent}`);
    console.log(`  subject: ${r.email_subject?.slice(0, 80)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
