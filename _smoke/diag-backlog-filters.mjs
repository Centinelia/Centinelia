// Verifica si BACKLOG tiene filas ocultas o filtros aplicados.

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
if ('error' in ctx) { console.error(ctx); process.exit(1); }

const { scope, itemId } = ctx.config.location;
const prefix = `https://graph.microsoft.com/v1.0/sites/${scope.siteId}/drives/${scope.driveId}/items/${itemId}`;
async function g(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// 1) range con rowHidden y hidden properties para detectar filas ocultas
console.log('── A5:A51 rowHidden (filas de datos de BACKLOG) ──');
const rowFlags = await g(`${prefix}/workbook/worksheets/BACKLOG/range(address='A5:A51')?$select=rowHidden,hidden,address`);
console.log('  rowHidden (bool o array):', JSON.stringify(rowFlags.rowHidden));
console.log('  hidden:', JSON.stringify(rowFlags.hidden));

// 2) Chequea cada fila individual
console.log('\n── Row-by-row hidden check (rows 5-51) ──');
let hiddenCount = 0;
let visibleCount = 0;
for (let r = 5; r <= 51; r++) {
  const rowRange = await g(`${prefix}/workbook/worksheets/BACKLOG/range(address='A${r}:I${r}')?$select=rowHidden`);
  if (rowRange.rowHidden) { hiddenCount++; console.log(`  row ${r}: HIDDEN`); }
  else visibleCount++;
}
console.log(`\n  Visible: ${visibleCount}, Hidden: ${hiddenCount}`);

// 3) Autofilter aplicado?
console.log('\n── AutoFilter aplicado en BACKLOG? ──');
try {
  const af = await g(`${prefix}/workbook/worksheets/BACKLOG/autoFilter`);
  console.log('  autoFilter:', JSON.stringify(af));
} catch (err) {
  console.log('  (sin autoFilter o error):', err.message.slice(0, 100));
}

// 4) Lista todas las tablas en el workbook (quizá hay una tabla llamada BACKLOG con filtros)
console.log('\n── Tablas del workbook ──');
const tables = await g(`${prefix}/workbook/tables?$select=id,name,worksheet,range,showHeaders,showFilterButton`);
for (const t of tables.value) {
  console.log(`  ${t.name} en hoja "${t.worksheet?.name ?? '?'}" showFilterButton=${t.showFilterButton}`);
}
