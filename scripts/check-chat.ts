import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  // Agent chat recent
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta, error')
    .ilike('source', '%chat%')
    .gte('created_at', '2026-10-09T00:00:00')
    .order('created_at', { ascending: false })
    .limit(10);
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.source} meta=${JSON.stringify(r.meta || {}).slice(0, 300)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
