// Verifica que la hoja BACKLOG humana del Excel real sigue intacta tras el
// switch a BACKLOG_NAMI. Debe mostrar las 47 filas que Camila mantiene a mano.
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/verify-backlog-humana-intacto.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;

const ctx = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
if ('error' in ctx) { console.error(ctx); process.exit(1); }

// Explícito: hoja BACKLOG humana (NO BACKLOG_NAMI que ahora está en config)
console.log('── Hoja BACKLOG (humana de Camila) ──');
const humana = await GraphExcel.readRange(ctx.token, ctx.config.location, 'BACKLOG', 'A1:H60');
let nonEmpty = 0;
for (const row of humana.values) {
  if (row.some(v => v !== '' && v !== null && v !== undefined)) nonEmpty++;
}
console.log('  Filas no-vacías en BACKLOG real:', nonEmpty, '(esperado: 47 — intacta)');

console.log('\n── Hojas del Excel real ──');
const sheets = await GraphExcel.listWorksheets(ctx.token, ctx.config.location);
console.log('  Hojas:', sheets.map(s => s.name).join(', '));
const tieneBacklogNami = sheets.some(s => s.name === 'BACKLOG_NAMI');
console.log('  BACKLOG_NAMI existe?', tieneBacklogNami ? 'SÍ (debería ser NO tras revert)' : 'NO ✓');

console.log('\n── Config apunta a hoja correcta ──');
const { data: orgCfg } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
const backlogSheetName = orgCfg?.inventory_excel_config?.sheets?.backlog?.name;
console.log('  sheets.backlog.name:', backlogSheetName, backlogSheetName === 'BACKLOG' ? '✓' : '✗ (esperado BACKLOG)');

console.log('\nResumen:');
if (nonEmpty >= 40 && !tieneBacklogNami && backlogSheetName === 'BACKLOG') {
  console.log('✓ BACKLOG humana PRESERVADA (' + nonEmpty + ' filas) + hoja BACKLOG_NAMI borrada + config apunta a BACKLOG. Listo para el Meet.');
} else {
  console.log('✗ Algo no cuadra. Revisar.');
}
