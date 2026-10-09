// Diagnóstico puntual: verifica si handler y verificación hablan del mismo sandbox.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const state = JSON.parse(fs.readFileSync('C:/Users/Nazre/centinelia/.ac-sandbox-state.json', 'utf8'));

const adapter = await import('../src/lib/inventory/adapter.ts');
const { data: agentRow } = await sb.from('voice_agents').select('*').eq('id', state.nami_agent_id).maybeSingle();

// Override DB config → sandbox
const { data: orgPre } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const originalItemId = orgPre.inventory_excel_config.location.itemId;
await sb.from('organizations').update({
  inventory_excel_config: { ...orgPre.inventory_excel_config, location: { ...orgPre.inventory_excel_config.location, itemId: state.sandbox_excel_item_id } },
}).eq('portal_email', PORTAL);

console.log('── Después del override DB ──');
console.log('  state.sandbox_excel_item_id:', state.sandbox_excel_item_id);
const { data: orgAfter } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
console.log('  DB config.itemId:          ', orgAfter.inventory_excel_config.location.itemId);

// Resolve ctx desde handler (como lo hace executeAgentTool)
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, state.nami_agent_id);
console.log('\n── ctx del handler (resolveInventoryContext) ──');
if ('error' in ctx) { console.log('  ERROR:', ctx.error); }
else {
  console.log('  config.location.itemId:   ', ctx.config.location.itemId);
  console.log('  config.sheets.historico:  ', JSON.stringify(ctx.config.sheets.historico));
}

// Fetch listTableRows directamente contra el itemId que ctx dice
const rows = await adapter.GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
console.log('\n  listTableRows().length =', rows.length, '(sin ninguna escritura previa, debe ser < 5333)');

// Agregar 1 row de prueba
console.log('\n── Agregando 1 row de prueba con OC=DIAGTEST01 ──');
const headers = await adapter.GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
const cols = ctx.config.columns_historico;
const ocIdx = headers.indexOf(cols.oc);
const modeloIdx = headers.indexOf(cols.modelo);
console.log('  ocIdx:', ocIdx, 'headers[ocIdx]:', headers[ocIdx]);
console.log('  modeloIdx:', modeloIdx, 'headers[modeloIdx]:', headers[modeloIdx]);

const rowValues = new Array(headers.length).fill('');
rowValues[ocIdx] = 'DIAGTEST01';
rowValues[modeloIdx] = 'DIAGMODEL';

await adapter.GraphExcel.withSession(ctx.token, ctx.config.location, async (sess) => {
  const addResult = await adapter.GraphExcel.addTableRow(ctx.token, sess, ctx.config.sheets.historico.table, rowValues);
  console.log('  addTableRow result:', addResult);
});

// Verificar que la row aparece
const rowsAfter = await adapter.GraphExcel.listTableRows(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
console.log('\n  listTableRows count after add:', rowsAfter.length);
const diagRow = rowsAfter.find(r => String(r.values[ocIdx] ?? '').trim() === 'DIAGTEST01');
console.log('  Row encontrada por OC=DIAGTEST01?', diagRow ? `SÍ (index=${diagRow.index})` : 'NO');

// Buscar en index 5337 (último índice reportado por addTableRow)
const lastRow = rowsAfter.find(r => r.index === 5337);
if (lastRow) {
  console.log('\n  Row en index 5337 (último esperado):');
  console.log('    values[ocIdx]:    ', JSON.stringify(lastRow.values[ocIdx]));
  console.log('    values[modeloIdx]:', JSON.stringify(lastRow.values[modeloIdx]));
  console.log('    first 10 values:  ', JSON.stringify(lastRow.values.slice(0, 10)));
}

// Buscar DIAGMODEL en cualquier row (por si fue a otra parte)
const diagModelRow = rowsAfter.find(r => String(r.values[modeloIdx] ?? '').trim() === 'DIAGMODEL');
console.log('\n  Row con MODELO=DIAGMODEL?', diagModelRow ? `SÍ (index=${diagModelRow.index}, oc="${diagModelRow.values[ocIdx]}")` : 'NO');

// Revertir config
await sb.from('organizations').update({
  inventory_excel_config: { ...orgAfter.inventory_excel_config, location: { ...orgAfter.inventory_excel_config.location, itemId: originalItemId } },
}).eq('portal_email', PORTAL);
console.log('\n✓ Config revertido a real:', originalItemId);
