import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const sb = createAdminClient();
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  console.log(`total tabla: ${rows.length}`);
  const byModelo = new Map<string, number>();
  for (const r of rows) {
    const vals = r.values as unknown[];
    if (String(vals[0] ?? '').trim().toUpperCase() !== 'OC04812') continue;
    const m = String(vals[9] ?? '').trim();
    byModelo.set(m, (byModelo.get(m) ?? 0) + 1);
  }
  console.log('\n=== OC04812 por modelo ===');
  for (const [m, c] of byModelo) console.log(`  ${m}: ${c} filas`);
  const total = Array.from(byModelo.values()).reduce((s, c) => s + c, 0);
  console.log(`\nTotal filas OC04812: ${total}`);
}
main().catch(e => console.error(e));
