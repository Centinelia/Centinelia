// Verifica metadata del Excel real: nombre, última modificación, lista hojas,
// y columnas reales de la hoja BACKLOG hasta Z (no solo H).

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

console.log('── Metadata del Excel ──');
const item = await g(`${prefix}?$select=id,name,size,lastModifiedDateTime,webUrl,createdBy,lastModifiedBy`);
console.log('  name:                 ', item.name);
console.log('  size:                 ', item.size, 'bytes');
console.log('  lastModifiedDateTime: ', item.lastModifiedDateTime);
console.log('  lastModifiedBy:       ', JSON.stringify(item.lastModifiedBy));
console.log('  webUrl:               ', item.webUrl);

console.log('\n── Hojas del workbook ──');
const sheets = await g(`${prefix}/workbook/worksheets?$select=id,name,visibility,position`);
for (const s of sheets.value) {
  console.log(`  pos=${s.position} name="${s.name}" visibility=${s.visibility}`);
}

console.log('\n── BACKLOG: lectura completa A1:Z100 ──');
const range = await g(`${prefix}/workbook/worksheets/BACKLOG/range(address='A1:Z100')?$select=values,columnCount,rowCount,address`);
console.log('  address:     ', range.address);
console.log('  rowCount:    ', range.rowCount);
console.log('  columnCount: ', range.columnCount);

// Imprime filas 1-15 en formato ASCII limpio para ver si hay secciones ocultas
console.log('\n── Rows 1-15 (primeras letras de cada cell) ──');
for (let i = 0; i < Math.min(15, range.values.length); i++) {
  const row = range.values[i];
  const compact = row.map(v => {
    if (v === '' || v === null || v === undefined) return '·';
    const s = String(v);
    return s.length > 15 ? s.slice(0, 12) + '…' : s;
  }).slice(0, 15).join(' | ');
  console.log(`  r${i + 1}: ${compact}`);
}

// Columnas usadas en TODAS las filas
console.log('\n── Columnas con contenido en algún lugar de A1:Z100 ──');
let maxUsedCol = 0;
for (const row of range.values) {
  for (let col = 0; col < row.length; col++) {
    if (row[col] !== '' && row[col] !== null && row[col] !== undefined) {
      if (col + 1 > maxUsedCol) maxUsedCol = col + 1;
    }
  }
}
console.log(`  columnas con contenido: 1-${maxUsedCol} (A-${String.fromCharCode(64 + maxUsedCol)})`);

// Row 4 (header) completo
console.log('\n── Row 4 completo (header per start_row=5) ──');
const hdr = range.values[3] ?? [];
for (let col = 0; col < Math.max(hdr.length, maxUsedCol); col++) {
  const v = hdr[col];
  if (v !== '' && v !== null && v !== undefined) {
    console.log(`  ${String.fromCharCode(65 + col)}4: "${v}"`);
  }
}
