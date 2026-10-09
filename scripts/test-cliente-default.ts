import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const execCtx = {
    agentId: '3245bc1f-89e1-4949-bbed-71a18b05e344', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos',
    portalToken: (agent as any).portal_token ?? '', agent: agent as any,
    supabase: sb as any, channel: 'email' as const, userContext: 'test cliente default',
  };
  // Test 1: SIN all_stock ni stock_modelos → CLIENTE vacío
  console.log('--- Test 1: OC fake sin stock → CLIENTE vacío ---');
  const r1 = await executeAgentTool('inv_procesar_oc_qb', {
    oc_numero: '99999',
    fecha_oc: '2026-10-09',
    items: [{ modelo: 'TEST_FAKE_MOD_A', cantidad: 1, usd_unit: 100, descripcion: 'test fake A' }],
  }, execCtx);
  console.log('result:', JSON.stringify(r1).slice(0, 300));

  // Test 2: con all_stock=true → CLIENTE=STOCK
  console.log('\n--- Test 2: con all_stock=true → CLIENTE=STOCK ---');
  const r2 = await executeAgentTool('inv_procesar_oc_qb', {
    oc_numero: '99998',
    fecha_oc: '2026-10-09',
    all_stock: true,
    items: [{ modelo: 'TEST_FAKE_MOD_B', cantidad: 1, usd_unit: 100, descripcion: 'test fake B' }],
  }, execCtx);
  console.log('result:', JSON.stringify(r2).slice(0, 300));

  // Verificar en Excel
  await new Promise(res => setTimeout(res, 3000));
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const iMod = headers.indexOf('MODELO');
  const iCli = headers.indexOf('CLIENTE');
  const iSal = headers.indexOf('SALIDA');
  const testRows = rows.filter((r: any) => {
    const v = r.values as unknown[];
    return String(v[iMod] ?? '').startsWith('TEST_FAKE_MOD');
  });
  console.log(`\n=== Test rows (${testRows.length}) ===`);
  for (const r of testRows) {
    const v = r.values as unknown[];
    console.log(`modelo=${v[iMod]} CLIENTE="${v[iCli]}" SALIDA=${v[iSal]} idx=${r.index}`);
  }

  // Cleanup: borrar test rows
  const tableName = inv.config.sheets.historico.table;
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  testRows.sort((a: any, b: any) => b.index - a.index);
  for (const r of testRows) {
    const url = `https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${r.index})`;
    await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${inv.token}` } });
  }
  console.log(`\ncleanup: ${testRows.length} test rows deleted`);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
