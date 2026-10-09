import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const iFechaOc = headers.indexOf('FECHA OC');
  // Dups: OC06203 + FECHA_OC vacío (los originales tienen 46192)
  const dups = rows.filter((r: any) => {
    const v = r.values as unknown[];
    const oc = String(v[0] ?? '').trim().toUpperCase();
    const fechaOc = v[iFechaOc];
    return oc === 'OC06203' && (!fechaOc || fechaOc === '');
  });
  console.log(`A borrar: ${dups.length} filas duplicadas`);
  dups.sort((a: any, b: any) => b.index - a.index);
  const tableName = inv.config.sheets.historico.table;
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  for (const r of dups) {
    const url = `https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${r.index})`;
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${inv.token}` } });
    console.log(`idx=${r.index}: ${res.ok ? 'OK' : 'ERR'}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
