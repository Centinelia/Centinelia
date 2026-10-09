import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { resolveInventoryContext } = await import('../src/lib/inventory/adapter');
  const ctx = await resolveInventoryContext('camila@acproyectos.com', sb as any, '3245bc1f-89e1-4949-bbed-71a18b05e344');
  if ('error' in ctx) return;
  const inv = ctx as any;

  // 1. Shared with me (desde el drive personal de Camila)
  console.log('--- 1. /me/drive/sharedWithMe ---');
  const sharedRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/sharedWithMe?$top=50`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  console.log('status:', sharedRes.status);
  if (sharedRes.ok) {
    const shared = await sharedRes.json() as any;
    const matches = (shared.value ?? []).filter((f: any) => /inventario/i.test(f.name ?? ''));
    for (const f of matches) {
      console.log(`  ${f.name} | parentDrive=${f.remoteItem?.parentReference?.driveId} | itemId=${f.remoteItem?.id ?? f.id}`);
    }
    if (matches.length === 0) console.log('  (no "inventario*" en shared)');
  }

  // 2. Buscar directamente en /me/drive por nombre
  console.log('\n--- 2. search en /me/drive ---');
  const sr2 = await fetch(`https://graph.microsoft.com/v1.0/me/drive/search(q='INVENTARIO 2026')?$top=10`, {
    headers: { Authorization: `Bearer ${inv.token}` }
  });
  console.log('status:', sr2.status);
  if (sr2.ok) {
    const r = await sr2.json() as any;
    for (const f of (r.value ?? [])) {
      console.log(`  ${f.name} | id=${f.id} | parentDrive=${f.parentReference?.driveId}`);
    }
  }

  // 3. Resolver sharing URL con encoding alterno (base64 strip padding)
  console.log('\n--- 3. share link resolution (encoding alterno) ---');
  const url = 'https://acproyectoshvac-my.sharepoint.com/:x:/r/personal/victoria_acproyectos_com/_layouts/15/Doc.aspx?sourcedoc=%7BE8BBB27E-6FD9-4907-AF99-785AC2F63948%7D&file=INVENTARIO%202026%201.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1&wdwpf=t';
  // Format oficial: encodeURL("u!" + Base64Urlencode)
  // Pero muchas veces el link tiene queryparams que estorban. Probar solo con el core
  const coreUrl = url.split('?')[0];
  for (const [label, u] of [['full', url], ['core', coreUrl]] as const) {
    const encoded = 'u!' + Buffer.from(u).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`, {
      headers: { Authorization: `Bearer ${inv.token}` }
    });
    console.log(`  ${label}: ${res.status}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
