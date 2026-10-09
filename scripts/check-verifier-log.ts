import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  // Sin filter de portal_email + sin filter de fecha estricto
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, portal_email, latency_ms, error, meta')
    .gte('created_at', '2026-10-08T20:35:00')
    .order('created_at', { ascending: true })
    .limit(30);
  console.log(`count: ${(logs ?? []).length}`);
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.source} pe=${r.portal_email || '-'} meta=${JSON.stringify(r.meta || {}).slice(0, 180)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
