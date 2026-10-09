import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const DRIVE = 'b!80MUr9I-0EOt-w2LQ02_ucWrBwmN-V9BkbdRKzQ1hv_-NcJhaxWeRqUPERuSn382';
  const ITEM = '01P4WGGAT6WK56RWLPA5E27GLYLLBPMOKI';

  // Listar hojas
  console.log('--- Hojas ---');
  const sheetsRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE}/items/${ITEM}/workbook/worksheets?$top=50`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  console.log('status:', sheetsRes.status);
  const sheets = await sheetsRes.json() as any;
  for (const s of (sheets.value ?? [])) {
    console.log(`  ${(s.visibility ?? 'Visible').toLowerCase() === 'visible' ? '👁 ' : '🔒 '} ${s.name} [${s.visibility}]`);
  }

  // Buscar tabla en INVENTARIO
  const tablesRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE}/items/${ITEM}/workbook/worksheets/INVENTARIO/tables?$top=10`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const tables = await tablesRes.json() as any;
  console.log('\n--- Tablas en INVENTARIO ---');
  for (const t of (tables.value ?? [])) {
    console.log(`  ${t.name} (${t.id})`);
  }

  // Headers de la primera tabla (asumo que es la histórica)
  const tableName = tables.value?.[0]?.name;
  if (tableName) {
    const headerRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE}/items/${ITEM}/workbook/worksheets/INVENTARIO/tables('${encodeURIComponent(tableName)}')/headerRowRange`, {
      headers: { Authorization: `Bearer ${inv.token}` }
    });
    const headers = await headerRes.json() as any;
    console.log(`\n--- Headers de tabla "${tableName}" ---`);
    const row = headers.values?.[0] ?? [];
    row.forEach((h: string, i: number) => console.log(`  [${i}] "${h}"`));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
