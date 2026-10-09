import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: row } = await sb.from('ops_inbox').select('id, status, sent_at, ai_draft')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T16:40:00Z').lte('created_at', '2026-10-08T16:40:30Z')
    .ilike('email_subject', 'REGISTRAR OC 6203').single();
  const r = row as any;
  console.log('status:', r.status, 'sent:', r.sent_at);
  console.log('draft:', String(r.ai_draft ?? '').slice(0, 500));

  const { data: muts } = await sb.from('inventory_mutations_log').select('created_at, tool_name, success, after_state')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T16:40:00Z').order('created_at');
  console.log('\n=== mutations ===');
  for (const m of (muts ?? []) as any[]) {
    console.log(`[${m.created_at}] ${m.tool_name} ok=${m.success} after=${JSON.stringify(m.after_state).slice(0, 200)}`);
  }
}
main().catch(e => console.error(e));
