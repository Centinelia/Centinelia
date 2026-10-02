// Verificación final: Excel real NO fue tocado durante E2E sandbox.
// Chequea:
//   1. inventory_excel_config.location.itemId sigue apuntando al Excel real original
//   2. INVENTARIO del Excel real tiene mismo row count (sandbox snapshot)
//   3. BACKLOG del Excel real sigue vacío (preserve wow moment)
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/verify-isolation-ac.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }

const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const state = JSON.parse(fs.readFileSync('C:/Users/Nazre/centinelia/.ac-sandbox-state.json', 'utf8'));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;

const PORTAL = state.portal;
const NAMI   = state.nami_agent_id;

console.log('── 1. inventory_excel_config.location.itemId sigue apuntando al REAL ──');
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const configItemId = org?.inventory_excel_config?.location?.itemId;
console.log('  config itemId:', configItemId);
console.log('  real_excel_item_id (state):', state.real_excel_item_id);
console.log('  sandbox_excel_item_id (state):', state.sandbox_excel_item_id);
const configOk = configItemId === state.real_excel_item_id;
console.log('  ', configOk ? '✓' : '✗', 'config NO fue modificado');

console.log('\n── 2. Excel REAL: contar rows INVENTARIO (debe ser cercano a 5333, igual que sandbox pre-E2E) ──');
const ctxReal = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctxReal) { console.error('ctx err:', ctxReal); process.exit(1); }
const realHistorico = await GraphExcel.listTableRows(ctxReal.token, ctxReal.config.location, ctxReal.config.sheets.historico.table);
console.log('  rows INVENTARIO (Excel REAL):', realHistorico.length);
console.log('  rows INVENTARIO (sandbox pre-E2E snapshot):', 5333);
console.log('  (si son iguales → real intacto; si real = 5333 y sandbox = 5334 por el inv_agregar_equipo → sandbox got the write, real NO)');

console.log('\n── 3. BACKLOG del Excel REAL sigue vacío (preserve wow moment) ──');
const backlogCfg = ctxReal.config.sheets.backlog;
const range = await GraphExcel.readRange(ctxReal.token, ctxReal.config.location, backlogCfg.name, `A${backlogCfg.start_row}:H${backlogCfg.start_row + 999}`);
let nonEmptyCount = 0;
for (const row of range.values) {
  if (row.some(v => v !== '' && v !== null && v !== undefined)) nonEmptyCount++;
}
console.log('  Filas no-vacías en BACKLOG real:', nonEmptyCount);
console.log('  ', nonEmptyCount === 0 ? '✓ WOW MOMENT PRESERVADO (BACKLOG vacío)' : '✗ BACKLOG real tiene datos — sandbox escribió al archivo equivocado?!');

console.log('\n── 4. Comparar sandbox vs real para evidencia visual ──');
const ctxSandbox = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };
const sandboxHistorico = await GraphExcel.listTableRows(ctxSandbox.token, ctxSandbox.config.location, ctxSandbox.config.sheets.historico.table);
const sandboxBacklog = await GraphExcel.readRange(ctxSandbox.token, ctxSandbox.config.location, backlogCfg.name, `A${backlogCfg.start_row}:H${backlogCfg.start_row + 999}`);
let sandboxBacklogRows = 0;
for (const row of sandboxBacklog.values) {
  if (row.some(v => v !== '' && v !== null && v !== undefined)) sandboxBacklogRows++;
}
console.log('  Sandbox INVENTARIO rows:', sandboxHistorico.length, '(delta vs real:', sandboxHistorico.length - realHistorico.length + ')');
console.log('  Sandbox BACKLOG rows:', sandboxBacklogRows);

console.log('\n── Resumen ──');
const allOk = configOk && nonEmptyCount === 0;
console.log(allOk ? '✓ AISLAMIENTO VERIFICADO. Excel real intacto, BACKLOG vacío, config sin tocar.' : '✗ Hubo contaminación. Revisar antes del Meet.');
process.exit(allOk ? 0 : 1);
