import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, status, sent_at, auto_mode_reason, attachments')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T22:00:00')
    .order('created_at', { ascending: false })
    .limit(3);
  for (const r of (data ?? []) as any[]) {
    const atts = ((r.attachments ?? []) as Array<any>).map((a: any) => a.name).join(', ');
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} sent=${r.sent_at ? 'Y' : 'N'} reason=${r.auto_mode_reason}`);
    console.log(`  atts=${atts}`);
  }
  // Check inherit log
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta')
    .eq('source', 'inbox_processor_inherit_attachments')
    .gte('created_at', '2026-10-08T22:00:00')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n=== inherit logs ===');
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] meta=${JSON.stringify(r.meta)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
