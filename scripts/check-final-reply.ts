import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, ai_summary, ai_draft, status, sent_at')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .order('created_at', { ascending: false })
    .limit(3);
  for (const r of (data ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} sent=${r.sent_at ? 'Y' : 'N'}`);
    console.log(`  summary: ${(r.ai_summary || '').slice(0, 200)}`);
    console.log(`  draft (300): ${(r.ai_draft || '').slice(0, 300)}`);
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
