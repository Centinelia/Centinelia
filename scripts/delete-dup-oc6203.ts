import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { resolveInventoryContext, GraphExcel } = await import('../src/lib/inventory/adapter');
  const sb = createAdminClient();
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  // Delete filas 5312, 5313 (table row index 5312, 5313 - 2 por header offset)
  const tableName = inv.config.sheets.historico.table;
  // Table-based delete: usar table row index. Las filas visibles 5313, 5314 (data) corresponden a tableRowIndex 5310, 5311.
  // Pero quiero borrar las 2 duplicadas. Son las filas con mismo OC+modelo+serie que las 5310, 5311.
  // Usamos deleteRow endpoint.
  for (const idx of [5313, 5312]) {  // orden descendente para no afectar indexes
    await fetch(`https://graph.microsoft.com/v1.0${inv.config.location.scope.type === 'site' ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}` : '/me/drive'}/items/${inv.config.location.itemId}/workbook/tables/${encodeURIComponent(tableName)}/rows/itemAt(index=${idx})`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${inv.token}` }
    }).then(r => console.log(`DEL row idx=${idx}: ${r.status}`));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
