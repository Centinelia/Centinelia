import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, status, sent_at, auto_mode_reason, attachments')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .order('created_at', { ascending: false })
    .limit(5);
  for (const r of (data ?? []) as any[]) {
    const atts = ((r.attachments ?? []) as Array<any>).map((a: any) => a.name).join(', ') || '(ninguno)';
    console.log(`[${r.created_at}] ${r.email_subject}`);
    console.log(`  status=${r.status} sent=${r.sent_at ? 'Y' : 'N'} reason=${r.auto_mode_reason}`);
    console.log(`  atts=${atts}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
