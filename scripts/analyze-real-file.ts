import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) { console.log('CTX ERR'); return; }
  const inv = ctx as any;

  // El sharing URL del archivo real
  const sharingUrl = 'https://acproyectoshvac-my.sharepoint.com/:x:/r/personal/victoria_acproyectos_com/_layouts/15/Doc.aspx?sourcedoc=%7BE8BBB27E-6FD9-4907-AF99-785AC2F63948%7D&file=INVENTARIO%202026%201.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1&wdwpf=t';
  // Encode base64url
  const encoded = Buffer.from(sharingUrl).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const shareId = `u!${encoded}`;

  // Resolve shares/{id}/driveItem
  const resolveRes = await fetch(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  console.log('resolve status:', resolveRes.status);
  if (!resolveRes.ok) {
    const err = await resolveRes.text();
    console.log('ERR:', err.slice(0, 500));
    console.log('\n→ El token de Camila no puede acceder al archivo de Victoria.');
    console.log('→ Camila/Victoria debe compartir el archivo con el user de Centinelia.');
    return;
  }
  const item = await resolveRes.json() as any;
  console.log(`file: ${item.name}`);
  console.log(`itemId: ${item.id}`);
  console.log(`parentDriveId: ${item.parentReference?.driveId}`);
  console.log(`parentSiteId: ${item.parentReference?.siteId ?? 'N/A'}`);

  // Listar hojas
  const sheetsRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${item.parentReference.driveId}/items/${item.id}/workbook/worksheets?$top=50`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const sheets = await sheetsRes.json() as any;
  console.log(`\nHojas (${sheets.value?.length ?? 0}):`);
  for (const s of (sheets.value ?? [])) {
    console.log(`  ${s.name} (visibility: ${s.visibility})`);
  }

  // Para INVENTARIO: leer headers (row 2 según config del playground)
  const headerRes = await fetch(`https://graph.microsoft.com/v1.0/drives/${item.parentReference.driveId}/items/${item.id}/workbook/worksheets/INVENTARIO/range(address='A2:AZ2')`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const headerData = await headerRes.json() as any;
  console.log(`\nINVENTARIO headers (row 2):`);
  console.log(JSON.stringify(headerData.values?.[0]?.filter(Boolean) ?? [], null, 2));
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
