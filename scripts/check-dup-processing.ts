import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('llm_call_log').select('created_at, source')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .eq('source', 'inbox_processor_summary')
    .gte('created_at', '2026-10-08T17:50:00Z')
    .lte('created_at', '2026-10-08T17:52:00Z');
  console.log('summary count in window:', data?.length);
  for (const l of (data ?? []) as any[]) console.log(` [${l.created_at}]`);

  // Y rows en ops_inbox con el mismo raw msg
  const { data: rows } = await sb.from('ops_inbox').select('id, created_at, status')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T17:50:00Z').lte('created_at', '2026-10-08T17:52:00Z');
  console.log('\nops_inbox rows:');
  for (const r of (rows ?? []) as any[]) console.log(` [${r.created_at}] ${r.id} ${r.status}`);
}
main().catch(e => console.error(e));
