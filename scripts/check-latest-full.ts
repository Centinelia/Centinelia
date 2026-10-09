import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: cols } = await sb.from('ops_inbox').select('*').limit(1);
  const { data: row } = await sb.from('ops_inbox').select('*')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T16:34:00Z')
    .order('created_at', { ascending: false }).limit(1).single();
  const r = row as any;
  console.log('id:', r.id, 'raw_message_id:', r.raw_message_id?.slice(0, 50));
  console.log('thread_id:', r.thread_id?.slice(0, 50));
  console.log('status:', r.status, 'category:', r.category);
  console.log('action_required:', r.action_required);
  console.log('attachments count:', (r.attachments ?? []).length);
  console.log('attachments:', (r.attachments ?? []).map((a: any) => `${a.name} (${a.type}, url?${!!a.download_url})`));
  console.log('ai_summary:', String(r.ai_summary ?? '').slice(0, 400));
  console.log('ai_draft:', String(r.ai_draft ?? '').slice(0, 400));
  console.log('body len:', (r.email_body ?? '').length);
}
main().catch(e => console.error(e));
