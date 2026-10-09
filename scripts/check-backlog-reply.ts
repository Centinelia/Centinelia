import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('ai_summary, ai_draft, email_body, auto_mode_reason, status')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T21:52:00')
    .order('created_at', { ascending: false })
    .limit(1);
  const r = (data ?? [])[0] as any;
  console.log('status:', r.status, 'reason:', r.auto_mode_reason);
  console.log('summary:', r.ai_summary);
  console.log('\nbody (300):', (r.email_body || '').slice(0, 300));
  console.log('\ndraft (1000):', (r.ai_draft || '').slice(0, 1000));
}
main().catch(e => { console.error(e); process.exit(1); });
