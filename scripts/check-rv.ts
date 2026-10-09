import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('id, ai_summary, ai_draft, auto_mode_decision, auto_mode_reason, sent_at')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .ilike('email_subject', 'RV: REGISTRAR OC 6203')
    .order('created_at', { ascending: false }).limit(1).single();
  const r = data as any;
  console.log('id:', r.id);
  console.log('auto_mode decision:', r.auto_mode_decision);
  console.log('auto_mode reason:', r.auto_mode_reason);
  console.log('sent_at:', r.sent_at);
  console.log('\n=== SUMMARY ===\n', r.ai_summary);
  console.log('\n=== DRAFT ===\n', r.ai_draft);

  // LLM calls para esa row
  const { data: llm } = await sb.from('llm_call_log')
    .select('created_at, source, meta')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T15:40:00Z')
    .lte('created_at', '2026-10-08T15:42:30Z')
    .order('created_at', { ascending: true });
  console.log('\n=== LLM CALLS ===');
  for (const l of (llm ?? []) as any[]) {
    console.log(`[${l.created_at}] ${l.source} meta=${JSON.stringify(l.meta ?? {}).slice(0, 200)}`);
  }

  // mutations
  const { data: muts } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, success, after_state')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T15:40:00Z')
    .order('created_at', { ascending: true });
  console.log('\n=== MUTATIONS ===');
  for (const m of (muts ?? []) as any[]) {
    console.log(`[${m.created_at}] ${m.tool_name} ok=${m.success} after=${JSON.stringify(m.after_state).slice(0, 200)}`);
  }
}
main().catch(e => console.error(e));
