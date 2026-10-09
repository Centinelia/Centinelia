import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('inventory_mutations_log')
    .select('*')
    .eq('portal_email', 'camila@acproyectos.com')
    .gte('created_at', '2026-10-08T21:40:00')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('count:', (data ?? []).length);
  for (const r of (data ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.tool_name}`);
    console.log(`  payload: ${JSON.stringify(r.payload).slice(0, 400)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
