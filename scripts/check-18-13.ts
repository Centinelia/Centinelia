import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: row } = await sb.from('ops_inbox').select('id, status, sent_at, auto_mode_reason, ai_draft')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .eq('created_at', '2026-10-08T18:13:36.915196+00:00').single();
  const r = row as any;
  console.log('status:', r.status, '| sent:', r.sent_at ?? 'NO');
  console.log('reason:', String(r.auto_mode_reason ?? '').slice(0, 180));
  console.log('\ndraft:', String(r.ai_draft ?? '').slice(0, 600));

  const { data: llm } = await sb.from('llm_call_log').select('created_at, source, meta')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T18:13:00Z').order('created_at');
  console.log('\n=== llm calls ===');
  for (const l of (llm ?? []) as any[]) console.log(`[${l.created_at.slice(11, 23)}] ${l.source} ${JSON.stringify(l.meta ?? {}).slice(0, 240)}`);

  const { data: muts } = await sb.from('inventory_mutations_log').select('created_at, tool_name, success')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T18:13:00Z').order('created_at');
  console.log('\n=== mutations ===');
  for (const m of (muts ?? []) as any[]) console.log(`[${m.created_at.slice(11, 23)}] ${m.tool_name} ok=${m.success}`);
}
main().catch(e => console.error(e));
