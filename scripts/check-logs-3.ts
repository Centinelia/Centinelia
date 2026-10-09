import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, latency_ms, error, meta')
    .gte('created_at', '2026-10-08T20:54:30')
    .lte('created_at', '2026-10-08T20:56:00')
    .order('created_at', { ascending: true });
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.source} lat=${r.latency_ms}ms err=${r.error ? r.error.slice(0,100) : '-'} meta=${JSON.stringify(r.meta || {}).slice(0, 280)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
