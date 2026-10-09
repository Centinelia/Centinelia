import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('llm_call_log').select('created_at, source, meta')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T16:42:00Z').lte('created_at', '2026-10-08T16:43:30Z')
    .order('created_at');
  for (const l of (data ?? []) as any[]) {
    console.log(`[${l.created_at}] ${l.source}`);
    console.log(JSON.stringify(l.meta ?? {}, null, 2).slice(0, 400));
    console.log('---');
  }
}
main().catch(e => console.error(e));
