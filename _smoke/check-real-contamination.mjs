import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');

const state = JSON.parse(fs.readFileSync('C:/Users/Nazre/centinelia/.ac-sandbox-state.json', 'utf8'));
const ctxReal = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
const ctxSandbox = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

console.log('── REAL (apuntado por config) ──');
const rowsR = await adapter.listHistorico(ctxReal);
const r_oc = rowsR.filter(r => String(r.values.oc ?? '').trim() === 'OC07119');
const r_test = rowsR.filter(r => String(r.values.serie ?? '').startsWith('TEST'));
console.log('  rows OC07119:', r_oc.length, '| rows serie TEST*:', r_test.length);

console.log('\n── SANDBOX ──');
const rowsS = await adapter.listHistorico(ctxSandbox);
const s_oc = rowsS.filter(r => String(r.values.oc ?? '').trim() === 'OC07119');
const s_test = rowsS.filter(r => String(r.values.serie ?? '').startsWith('TEST'));
console.log('  rows OC07119:', s_oc.length, '| rows serie TEST*:', s_test.length);
s_oc.forEach(r => console.log('    idx=' + r.index + ' modelo=' + r.values.modelo + ' serie=' + r.values.serie + ' familia=' + r.values.familia + ' oc=' + r.values.oc));
if (s_test[0]) {
  console.log('\n  Sample fila TEST:');
  for (const [k, v] of Object.entries(s_test[0].values)) console.log('    ', k, '=', JSON.stringify(v));
}
