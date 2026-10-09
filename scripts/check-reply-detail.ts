import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, created_at, sent_at, email_subject, status, ai_draft, ai_summary, auto_mode_reason, auto_mode_signals')
    .eq('id', (await sb.from('ops_inbox').select('id').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').ilike('email_subject', '%Re: %Backlog%').order('created_at', { ascending: false }).limit(1).single()).data!.id).single();
  const r = data as any;
  console.log('created:', r.created_at);
  console.log('sent_at:', r.sent_at);
  console.log('status:', r.status);
  console.log('reason:', r.auto_mode_reason);
  console.log('signals:', JSON.stringify(r.auto_mode_signals));
  console.log('summary:', r.ai_summary);
  console.log('\ndraft (800):', (r.ai_draft || '').slice(0, 800));
}
main().catch(e => { console.error(e); process.exit(1); });
