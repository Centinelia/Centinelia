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
  const oc = rows.filter((r: any) => String((r.values as unknown[])[0] ?? '').trim().toUpperCase() === 'OC06203');
  const iMod = headers.indexOf('MODELO');
  const iSer = headers.indexOf('SERIE');
  const iEstatus = headers.indexOf('ESTATUS');
  const iFactTrane = headers.indexOf('FACT TRANE');
  const iCliente = headers.indexOf('CLIENTE');
  const iFechaOc = headers.indexOf('FECHA OC');
  console.log(`OC06203: ${oc.length} filas`);
  for (const r of oc) {
    const v = r.values as unknown[];
    console.log(`  idx=${r.index} modelo=${v[iMod]} serie=${v[iSer]} ESTATUS=${v[iEstatus]} FACT=${v[iFactTrane]} CLIENTE=${v[iCliente]} FECHA_OC=${v[iFechaOc]}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
