import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) { console.log('CTX ERR'); return; }
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const oc = rows.filter((r: any) => String((r.values as unknown[])[0] ?? '').trim().toUpperCase() === 'OC06203');
  console.log(`A borrar: ${oc.length} filas`);
  const tableName = inv.config.sheets.historico.table;
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  // Descendente para no corromper indices
  oc.sort((a: any, b: any) => b.index - a.index);
  for (const r of oc) {
    const url = `https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${r.index})`;
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${inv.token}` } });
    console.log(`idx=${r.index}: ${res.ok ? 'OK' : 'ERR ' + await res.text()}`);
  }
  // Verify
  const rows2 = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const oc2 = rows2.filter((r: any) => String((r.values as unknown[])[0] ?? '').trim().toUpperCase() === 'OC06203');
  console.log(`\nRestantes OC06203: ${oc2.length}`);
}
main().catch(e => { console.error(e); process.exit(1); });
