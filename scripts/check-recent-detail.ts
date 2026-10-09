import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox').select('id, created_at, email_subject, email_body, attachments, status, ai_draft')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T16:45:00Z').order('created_at');
  for (const r of (data ?? []) as any[]) {
    console.log(`\n=== [${r.created_at}] ${r.email_subject} | ${r.status} ===`);
    console.log('atts:', (r.attachments ?? []).map((a: any) => a.name).slice(0, 3));
    console.log('body preview:', (r.email_body ?? '').slice(0, 400));
    console.log('draft:', (r.ai_draft ?? '').slice(0, 200));
  }
}
main().catch(e => console.error(e));
