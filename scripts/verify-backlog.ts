import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  // Fetch logs
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta, error')
    .gte('created_at', '2026-10-08T21:40:00')
    .order('created_at', { ascending: true })
    .limit(15);
  for (const r of (logs ?? []) as any[]) {
    console.log(`[${r.created_at}] ${r.source} ${r.error ? 'ERR: ' + r.error.slice(0, 80) : ''} meta=${JSON.stringify(r.meta || {}).slice(0, 200)}`);
  }
  // Verify BACKLOG rows
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const backlogCfg = inv.config.sheets?.backlog;
  if (!backlogCfg) { console.log('\nNo backlog config'); return; }
  console.log(`\nBacklog sheet: ${backlogCfg.name}`);
  // Try to list rows
  try {
    const tableName = inv.config.sheets.backlog.table ?? backlogCfg.name;
    const rows = await GraphExcel.listTableRows(inv.token, inv.config.location, tableName);
    console.log(`Backlog rows: ${rows.length}`);
    if (rows.length > 0) {
      const headers = await GraphExcel.getTableHeader(inv.token, inv.config.location, tableName);
      console.log('headers:', headers.slice(0, 10).join(' | '));
      for (const r of rows.slice(0, 5)) {
        console.log(`  ${JSON.stringify(r.values).slice(0, 180)}`);
      }
    }
  } catch (e) {
    console.log('ERR reading backlog:', e instanceof Error ? e.message : e);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
