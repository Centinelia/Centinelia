import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('llm_call_log').select('created_at, source, meta, error')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-08T17:49:00Z')
    .lte('created_at', '2026-10-08T17:52:00Z')
    .order('created_at');
  for (const l of (data ?? []) as any[]) {
    console.log(`[${l.created_at.slice(11, 23)}] ${l.source}${l.error ? ' ERROR!' : ''}`);
    if (l.meta) console.log('  meta:', JSON.stringify(l.meta).slice(0, 250));
    if (l.error) console.log('  error:', l.error.slice(0, 300));
  }
}
main().catch(e => console.error(e));
