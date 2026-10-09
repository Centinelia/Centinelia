import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  // Logs de tool invocation para el inbox item más reciente
  const inboxId = '0692d652-7821-47d4-8b0e-40c42540caf1';
  // Query ai_ops_log for recent ops
  const { data: ops } = await sb.from('ai_ops_log')
    .select('created_at, tool_name, portal_email, reference_id, ops_charged, status, error')
    .eq('portal_email', 'camila@acproyectos.com')
    .gte('created_at', '2026-10-08T20:29:00')
    .order('created_at', { ascending: false });
  console.log(`=== ai_ops_log recientes (post-sync 20:30) ===`);
  for (const r of (ops ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.tool_name} ops=${r.ops_charged} status=${r.status || 'ok'} ref=${r.reference_id?.slice(0,60)} err=${r.error || ''}`);
  }

  // Verify Excel: filas OC06203
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) { console.log('CTX ERR', ctx); return; }
  const inv = ctx as any;
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const oc6203 = rows.filter((r: any) => {
    const vals = r.values as unknown[];
    return String(vals[0] ?? '').trim().toUpperCase() === 'OC06203';
  });
  console.log(`\n=== Excel filas OC06203 ===`);
  console.log(`Total: ${oc6203.length}`);
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const iMod = headers.indexOf('MODELO');
  const iSer = headers.indexOf('SERIE');
  const iTC = headers.indexOf('TC');
  const iCostoMx = headers.indexOf('COSTO MX');
  const iFactTrane = headers.indexOf('FACT TRANE');
  const iCliente = headers.indexOf('CLIENTE');
  console.log(`col indices: MODELO=${iMod} SERIE=${iSer} TC=${iTC} COSTO MX=${iCostoMx} FACT TRANE=${iFactTrane} CLIENTE=${iCliente}`);
  for (const r of oc6203.slice(0, 10)) {
    const v = r.values as unknown[];
    console.log(`  modelo=${v[iMod]} serie=${v[iSer]} tc=${v[iTC]} costoMx=${v[iCostoMx]} factTrane=${v[iFactTrane]} cliente=${v[iCliente]}`);
  }
  if (oc6203.length > 10) console.log(`  ... (${oc6203.length - 10} más)`);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
