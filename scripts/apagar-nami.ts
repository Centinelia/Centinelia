import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const AGENT_ID = '3245bc1f-89e1-4949-bbed-71a18b05e344';
  const PORTAL = 'camila@acproyectos.com';

  // ─── PASO 1: Limpieza playground Excel ────────────────────────────────────
  console.log('--- PASO 1: Excel playground ---');
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext(PORTAL, sb as any, AGENT_ID);
  if ('error' in ctx) { console.log('CTX ERR'); return; }
  const inv = ctx as any;
  const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, inv.config.sheets.historico.table);
  const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, inv.config.sheets.historico.table);
  // Las filas de PRUEBA son las OC06203 (demo), OC99999, OC99998, OC06568 (angeles), TEST_*
  const testOcSet = new Set(['OC06203', 'OC99999', 'OC99998', 'OC06568']);
  const testRows = rows.filter((r: any) => {
    const v = r.values as unknown[];
    const oc = String(v[0] ?? '').trim().toUpperCase();
    const modelo = String(v[9] ?? '');
    return testOcSet.has(oc) || modelo.startsWith('TEST_FAKE_MOD');
  });
  console.log(`Filas test en Excel: ${testRows.length}`);
  const tableName = inv.config.sheets.historico.table;
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  testRows.sort((a: any, b: any) => b.index - a.index);
  for (const r of testRows) {
    const url = `https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${r.index})`;
    await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${inv.token}` } });
  }
  console.log(`Deleted: ${testRows.length} filas`);

  // ─── PASO 2: Borrar ops_inbox test ───────────────────────────────────────
  console.log('\n--- PASO 2: ops_inbox items test ---');
  const { data: inboxItems } = await sb.from('ops_inbox')
    .select('id, email_subject')
    .eq('agent_id', AGENT_ID)
    .gte('created_at', '2026-10-01T00:00:00');
  const ids = (inboxItems ?? []).map((r: any) => r.id);
  console.log(`A borrar: ${ids.length} inbox items desde 2026-10-01`);
  if (ids.length > 0) {
    const { error } = await sb.from('ops_inbox').delete().in('id', ids);
    if (error) console.log('ERR:', error);
    else console.log('OK deleted');
  }

  // ─── PASO 3: inventory_mutations_log ─────────────────────────────────────
  console.log('\n--- PASO 3: inventory_mutations_log ---');
  const { data: muts, error: mutErr } = await sb.from('inventory_mutations_log')
    .delete({ count: 'exact' })
    .eq('portal_email', PORTAL)
    .gte('created_at', '2026-10-01T00:00:00');
  if (mutErr) console.log('ERR:', mutErr);
  else console.log(`deleted mutations (count fetched after)`);

  // ─── PASO 4: Apagar agent (active=false) ─────────────────────────────────
  console.log('\n--- PASO 4: active=false ---');
  const { error: upErr } = await sb.from('voice_agents').update({ active: false }).eq('id', AGENT_ID);
  if (upErr) console.log('ERR:', upErr);
  else console.log('OK Nami inactiva');

  // ─── PASO 5: Pool a 0 (opción B) ─────────────────────────────────────────
  console.log('\n--- PASO 5: pool a 0 ---');
  // Check columnas disponibles en voice_agents
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', AGENT_ID).single();
  const a = agent as any;
  const poolFields: Record<string, number> = {};
  if ('minutes_included' in a) poolFields.minutes_included = 0;
  if ('minutes_used' in a) poolFields.minutes_used = 0;
  console.log('fields to zero:', Object.keys(poolFields));
  if (Object.keys(poolFields).length > 0) {
    const { error: poolErr } = await sb.from('voice_agents').update(poolFields).eq('id', AGENT_ID);
    if (poolErr) console.log('ERR:', poolErr);
    else console.log('OK pool zeroed');
  }

  console.log('\n=== DONE ===');
  console.log('Pendiente: paso 4-5 (apuntar al archivo real) — esperando que Victoria comparta el archivo con camila@acproyectos.com.');
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
