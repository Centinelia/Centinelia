import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('ai_summary, ai_draft')
    .eq('id', (await sb.from('ops_inbox').select('id').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').ilike('email_subject', '%Procesa Backlog%').single()).data!.id)
    .single();
  const r = data as any;
  console.log('summary:', r.ai_summary);
  console.log('\ndraft (1500):', (r.ai_draft || '').slice(0, 1500));
}
main().catch(e => { console.error(e); process.exit(1); });
