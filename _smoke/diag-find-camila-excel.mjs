// Busca TODOS los archivos "INVENTARIO NAMI" en el SharePoint de Camila para
// detectar duplicados / versiones.

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
if ('error' in ctx) { console.error(ctx); process.exit(1); }

const { scope } = ctx.config.location;
const driveBase = `https://graph.microsoft.com/v1.0/sites/${scope.siteId}/drives/${scope.driveId}`;

async function g(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

console.log('── Config actual DB ──');
console.log('  itemId:', ctx.config.location.itemId);

console.log('\n── Search: INVENTARIO ──');
const search = await g(`${driveBase}/root/search(q='INVENTARIO')?$select=id,name,parentReference,lastModifiedDateTime,size,webUrl`);
const xlsx = search.value.filter(x => /\.xlsx$/i.test(x.name));
for (const x of xlsx) {
  const marker = x.id === ctx.config.location.itemId ? ' ← DB APUNTA AQUÍ' : '';
  console.log(`  ${x.name} ${marker}`);
  console.log(`    id:       ${x.id}`);
  console.log(`    folder:   ${x.parentReference?.path ?? '?'}`);
  console.log(`    modified: ${x.lastModifiedDateTime}`);
  console.log(`    size:     ${x.size}`);
  console.log(`    webUrl:   ${x.webUrl}`);
  console.log('');
}
console.log(`Total xlsx con "INVENTARIO" en el nombre: ${xlsx.length}`);

// También buscar hojas con nombres como "FLAPPER" "TD CTRL" "UTILIDAD" que son del Excel que Camila ve
console.log('\n── ¿Las hojas del screenshot aparecen en el Excel actual de la DB? ──');
const prefix = `${driveBase}/items/${ctx.config.location.itemId}`;
const sheets = await g(`${prefix}/workbook/worksheets?$select=name,visibility`);
console.log('  hojas actuales:', sheets.value.map(s => s.name).join(', '));
console.log('  esperadas (screenshot): INVENTARIO, STOCK, Hoja2, BACKLOG, TD CTRL, UTILIDAD, FLAPPER, Hoja3');
