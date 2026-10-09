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
  // Borrar filas con OC04812 + modelo que termine en "A1000AA" para TXK (las que yo creé)
  const toDelete: number[] = [];
  for (const r of rows) {
    const vals = r.values as unknown[];
    if (String(vals[0] ?? '').trim().toUpperCase() !== 'OC04812') continue;
    const m = String(vals[9] ?? '').trim();
    if (/^3TXK\d+A1000AA$/.test(m)) toDelete.push(r.index);
  }
  console.log(`A borrar: ${toDelete.length} filas`);
  const tableName = inv.config.sheets.historico.table;
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  // Orden descendente para no corromper índices
  toDelete.sort((a, b) => b - a);
  let deleted = 0;
  for (const idx of toDelete) {
    const res = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${idx})`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${inv.token}` }
    });
    if (res.ok) deleted++;
  }
  console.log(`Deleted: ${deleted}`);
}
main().catch(e => { console.error(e); process.exit(1); });
