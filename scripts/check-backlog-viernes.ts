import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, status, sent_at, auto_mode_reason, ai_draft, ai_summary')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-09T16:50:00')
    .ilike('email_subject', '%backlog%')
    .order('created_at', { ascending: false })
    .limit(3);
  for (const r of (inbox ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} sent=${r.sent_at ? 'Y' : 'N'} reason=${r.auto_mode_reason}`);
    console.log(`  summary: ${(r.ai_summary || '').slice(0, 200)}`);
    console.log(`  draft (500): ${(r.ai_draft || '').slice(0, 500)}`);
    console.log('');
  }
  // Logs
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta')
    .gte('created_at', '2026-10-09T17:00:00')
    .ilike('source', '%backlog%')
    .order('created_at', { ascending: true })
    .limit(10);
  console.log('=== backlog logs ===');
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.source} meta=${JSON.stringify(r.meta || {}).slice(0, 200)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
