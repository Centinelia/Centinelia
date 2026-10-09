import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, status, category, auto_mode_reason, auto_mode_signals, tools_invoked, sent_at')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T20:50:00')
    .order('created_at', { ascending: false });
  for (const r of (data ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} category=${r.category} sent_at=${r.sent_at}`);
    console.log(`  reason=${r.auto_mode_reason} signals=${JSON.stringify(r.auto_mode_signals)}`);
    console.log(`  tools=${JSON.stringify(r.tools_invoked)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
