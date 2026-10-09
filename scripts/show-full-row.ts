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
  for (const r of rows) {
    const vals = r.values as unknown[];
    const oc = String(vals[0] ?? '');
    if (!oc.includes('6203')) continue;
    console.log(`\n=== row ${r.index} ===`);
    headers.forEach((h, i) => {
      const v = vals[i];
      if (v !== null && v !== undefined && String(v).trim() !== '') console.log(`  ${h}: ${v}`);
    });
  }
}
main().catch(e => console.error(e));
