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
  console.log(`OC06203: ${oc.length} filas`);
  const iMod = headers.indexOf('MODELO');
  const iSer = headers.indexOf('SERIE');
  const iTC = headers.indexOf('TC');
  const iCostoMx = headers.indexOf('COSTO COMPRA (MX)');
  const iFactTrane = headers.indexOf('FACT TRANE');
  const iUsd = headers.indexOf('$ USD');
  const iCliente = headers.indexOf('CLIENTE');
  const iDesc = headers.indexOf('DESCRIPCION');
  const iTR = headers.indexOf('TR');
  const iSeer = headers.indexOf('SEER');
  const iRef = headers.indexOf('REF');
  const iVolts = headers.indexOf('VOLTS');
  for (const r of oc) {
    const v = r.values as unknown[];
    console.log(`\nmodelo=${v[iMod]} serie=${v[iSer]}`);
    console.log(`  TR=${v[iTR]} SEER=${v[iSeer]} REF=${v[iRef]} VOLTS=${v[iVolts]}`);
    console.log(`  USD=${v[iUsd]} TC=${v[iTC]} COSTO MX=${v[iCostoMx]}`);
    console.log(`  factTrane=${v[iFactTrane]} cliente=${v[iCliente]}`);
    console.log(`  desc=${String(v[iDesc] ?? '').slice(0, 80)}`);
  }
  // Check inventory_mutations_log
  const { data: mut } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, oc_numero, filas_afectadas')
    .eq('portal_email', 'camila@acproyectos.com')
    .gte('created_at', '2026-10-08T20:00:00')
    .order('created_at', { ascending: false });
  console.log(`\ninventory_mutations_log since 20:00:`);
  for (const r of (mut ?? []) as any[]) {
    console.log(`  [${r.created_at}] ${r.tool_name} oc=${r.oc_numero} filas=${r.filas_afectadas}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
