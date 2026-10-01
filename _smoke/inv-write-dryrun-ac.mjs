// Smoke test: escribe celda scratch en Excel AC, verifica, revierte.
// Requiere ALLOW_PROD_SMOKE=true porque toca Excel real en SharePoint.
// Uso: ALLOW_PROD_SMOKE=true node _smoke/inv-write-dryrun-ac.mjs

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

if (process.env.ALLOW_PROD_SMOKE !== 'true') {
  console.error('Requiere ALLOW_PROD_SMOKE=true. Aborting.');
  process.exit(1);
}

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

// Lee primera serie real de Tabla6
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error('ctx err:', ctx); process.exit(1); }

const rows = await adapter.GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
const firstSerie = rows[0]?.values?.[2]; // serie column
if (!firstSerie) { console.error('No hay rows en Tabla6'); process.exit(1); }
console.log('Serie de prueba:', firstSerie);

// Dry-run: patch estatus → '__TEST__' y revierte
const beforeHit = await adapter.findRowIndexBySerie(ctx, String(firstSerie));
if (!beforeHit) { console.error('serie no encontrada'); process.exit(1); }
const estatusIdx = beforeHit.headersMap['ESTATUS'];
const estatusActual = beforeHit.row[estatusIdx];
console.log('Estatus actual:', estatusActual);

const r1 = await adapter.patchEstatusBySerie(ctx, String(firstSerie), '__TEST__');
console.log('Patch result:', JSON.stringify(r1, null, 2));

// Revertir
const r2 = await adapter.patchEstatusBySerie(ctx, String(firstSerie), String(estatusActual));
console.log('Revert result:', JSON.stringify(r2, null, 2));

const after = await adapter.findRowIndexBySerie(ctx, String(firstSerie));
if (String(after.row[estatusIdx]) !== String(estatusActual)) {
  console.error('CORRUPTION — estatus no quedó en original!');
  process.exit(1);
}
console.log('OK — smoke test passed. Excel intacto.');
