import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, error, meta')
    .gte('created_at', '2026-10-08T20:55:05')
    .lte('created_at', '2026-10-08T20:55:08')
    .order('created_at', { ascending: true });
  for (const r of (logs ?? []) as any[]) {
    console.log(`\n[${r.created_at}] ${r.source}`);
    console.log(`  err: ${r.error}`);
    console.log(`  meta: ${JSON.stringify(r.meta || {}).slice(0, 800)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
