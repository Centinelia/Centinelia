import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta')
    .gte('created_at', '2026-10-08T22:03:00')
    .order('created_at', { ascending: true })
    .limit(30);
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.source} meta=${JSON.stringify(r.meta || {}).slice(0, 250)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
