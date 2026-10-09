import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  console.log('scope:', inv.config.location.scope);
  console.log('itemId:', inv.config.location.itemId);
  const base = inv.config.location.scope.type === 'site'
    ? `/sites/${inv.config.location.scope.siteId}/drives/${inv.config.location.scope.driveId}`
    : '/me/drive';
  // Fetch file metadata
  const metaRes = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const meta = await metaRes.json();
  console.log('file name:', (meta as any).name);
  console.log('webUrl:', (meta as any).webUrl?.slice(0, 150));
  // Listar hojas con top=50
  const sheetsRes = await fetch(`https://graph.microsoft.com/v1.0${base}/items/${inv.config.location.itemId}/workbook/worksheets?$top=50`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const sheetsJson = await sheetsRes.json() as any;
  console.log('\nSheets found:', sheetsJson.value?.length);
  for (const s of (sheetsJson.value ?? [])) {
    console.log(`  ${s.name} (visibility: ${s.visibility ?? '?'})`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
