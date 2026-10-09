import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  console.log('HEADERS:', JSON.stringify(headers));
  // Buscar costo
  const costoCols = headers.map((h: string, i: number) => ({ h, i })).filter(({h}: any) => /costo/i.test(h));
  console.log('COSTO cols:', costoCols);

  // Full ops log last 24h for camila
  const { data: ops } = await sb.from('ai_ops_log')
    .select('created_at, tool_name, ops_charged, reference_id')
    .eq('portal_email', 'camila@acproyectos.com')
    .gte('created_at', '2026-10-08T20:00:00')
    .order('created_at', { ascending: false });
  console.log(`\nai_ops_log total since 20:00: ${(ops ?? []).length}`);
  for (const r of (ops ?? []).slice(0, 15) as any[]) {
    console.log(`  [${r.created_at}] ${r.tool_name} ops=${r.ops_charged}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
