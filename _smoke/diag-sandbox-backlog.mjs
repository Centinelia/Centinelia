import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const state = JSON.parse(fs.readFileSync('C:/Users/Nazre/centinelia/.ac-sandbox-state.json','utf8'));
const adapter = await import('../src/lib/inventory/adapter.ts');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');
const ctxReal = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
const ctx = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };
const resolved = await syncer.resolveColumns(ctx, { name: 'BACKLOG', start_row: 5 });
console.log('colIndex detectadas:', JSON.stringify(resolved.colIndex, null, 2));
console.log('firstDataCol:', resolved.firstDataCol, 'lastDataCol:', resolved.lastDataCol);
const { index, maxContentRow } = await syncer.readBacklogIndex(ctx, { name: 'BACKLOG', start_row: 5 });
console.log('\nindex.size:', index.size, 'maxContentRow:', maxContentRow);
console.log('\nPrimeras 5 keys:');
let n = 0;
for (const [k, v] of index) {
  if (n++ >= 5) break;
  console.log(`  ${k} → row ${v.rowNumber}`);
}
