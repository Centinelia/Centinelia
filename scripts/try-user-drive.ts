import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;
  const ITEM = '01P4WGGAT6WK56RWLPA5E27GLYLLBPMOKI';

  // Approach 1: /users/victoria.../drive/items/{itemId}
  console.log('--- 1. /users/victoria@acproyectos.com/drive/items/{item} ---');
  const r1 = await fetch(`https://graph.microsoft.com/v1.0/users/victoria@acproyectos.com/drive/items/${ITEM}`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  console.log('status:', r1.status);
  if (r1.ok) {
    const j = await r1.json() as any;
    console.log('name:', j.name, 'id:', j.id);
  }

  // Approach 2: /me/drive/items/{remoteItem.id} del sharedWithMe
  console.log('\n--- 2. /me/drive/items/{item} direct ---');
  const r2 = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${ITEM}`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  console.log('status:', r2.status);

  // Approach 3: resolver el remoteItem desde sharedWithMe
  console.log('\n--- 3. sharedWithMe item details ---');
  const r3 = await fetch(`https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=50`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  const list = await r3.json() as any;
  const file = (list.value ?? []).find((f: any) => f.name === 'INVENTARIO 2026 1.xlsx');
  if (file) {
    console.log('file.id (local shortcut):', file.id);
    console.log('remoteItem.id:', file.remoteItem?.id);
    console.log('remoteItem.parentReference.driveId:', file.remoteItem?.parentReference?.driveId);
    console.log('remoteItem.webUrl:', file.remoteItem?.webUrl?.slice(0, 150));
    // Try /me/drive/items/{localShortcutId}
    const r4 = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/workbook/worksheets`, {
      headers: { Authorization: `Bearer ${inv.token}` }
    });
    console.log('\n--- 4. /me/drive/items/{localShortcutId}/workbook/worksheets ---');
    console.log('status:', r4.status);
    if (r4.ok) {
      const j4 = await r4.json() as any;
      console.log('sheets:');
      for (const s of (j4.value ?? [])) console.log(`  ${s.name} [${s.visibility}]`);
    } else {
      console.log(await r4.text());
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
