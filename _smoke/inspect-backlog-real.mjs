// Inspect: qué hay realmente en el BACKLOG del Excel real de Camila.
// Para contrastar con el ruling "BACKLOG vacío para wow moment".
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/inspect-backlog-real.mjs

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

const cfg = ctx.config.sheets.backlog;
console.log('BACKLOG config:', JSON.stringify(cfg));
console.log('Excel real itemId:', ctx.config.location.itemId);

// Leer rango completo A1:H60 para ver TODO incluyendo headers
const range = await GraphExcel.readRange(ctx.token, ctx.config.location, cfg.name, 'A1:H60');
console.log('\nRango A1:H60 del Excel real:');
range.values.forEach((row, i) => {
  const rowNum = i + 1;
  const hasContent = row.some(v => v !== '' && v !== null && v !== undefined);
  if (!hasContent) return;
  const preview = row.map(v => {
    const s = String(v ?? '').trim();
    return s.length > 20 ? s.slice(0, 18) + '..' : s;
  }).join(' | ');
  console.log(`  R${rowNum} ${rowNum === cfg.start_row ? '← start_row' : ''}: ${preview}`);
});
