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
  console.log(`OC06203 filas: ${oc.length}`);
  const iEstatus = headers.indexOf('ESTATUS');
  const iFolio = headers.indexOf('FOLIO');
  const iCliente = headers.indexOf('CLIENTE');
  const iSalida = headers.indexOf('SALIDA');
  const tableName = inv.config.sheets.historico.table;
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  for (const r of oc) {
    const idx = r.index;
    const current = [...(r.values as unknown[])];
    current[iEstatus] = 'PEDIDO';
    current[iFolio] = '';
    current[iCliente] = 'STOCK';
    current[iSalida] = 1;
    const url = `https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${idx})`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${inv.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [current] }),
    });
    if (!res.ok) { console.log('PATCH err', idx, await res.text()); continue; }
    console.log(`reset idx=${idx}`);
  }
  // Verify
  const rows2 = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const oc2 = rows2.filter((r: any) => String((r.values as unknown[])[0] ?? '').trim().toUpperCase() === 'OC06203');
  for (const r of oc2) {
    const v = r.values as unknown[];
    console.log(`modelo=${v[headers.indexOf('MODELO')]} ESTATUS=${v[iEstatus]} FOLIO=${v[iFolio]} CLIENTE=${v[iCliente]} SALIDA=${v[iSalida]}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
