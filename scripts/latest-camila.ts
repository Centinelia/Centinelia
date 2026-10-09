import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, status, sent_at, auto_mode_reason, ai_draft')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-09T17:00:00')
    .order('created_at', { ascending: false })
    .limit(3);
  for (const r of (data ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} sent=${r.sent_at ? 'Y' : 'N'}`);
    console.log(`  draft(400): ${(r.ai_draft || '').slice(0, 400)}`);
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
