import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, thread_id')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T21:40:00')
    .ilike('email_subject', '%Backlog%')
    .order('created_at', { ascending: true });
  for (const r of (data ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  thread_id: ${r.thread_id}`);
    console.log(`  id: ${r.id}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
