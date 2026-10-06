// Diag puro del nuevo syncer contra el REAL (read-only).
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');
const ctx = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
if ('error' in ctx) { console.error(ctx); process.exit(1); }

console.log('── resolveColumns ──');
const resolved = await syncer.resolveColumns(ctx, { name: 'BACKLOG', start_row: 5 });
console.log('  headerRowNumber:', resolved.headerRowNumber);
console.log('  dataStartRow:   ', resolved.dataStartRow);
console.log('  firstDataCol:   ', resolved.firstDataCol);
console.log('  lastDataCol:    ', resolved.lastDataCol);
console.log('  usingLegacy:    ', resolved.usingLegacyLayout);
console.log('  colIndex:       ', resolved.colIndex);

console.log('\n── readBacklogIndex ──');
const { index, maxContentRow } = await syncer.readBacklogIndex(ctx, { name: 'BACKLOG', start_row: 5 });
console.log('  index.size:    ', index.size);
console.log('  maxContentRow: ', maxContentRow);
console.log('\n  Primeras 10 keys:');
let n = 0;
for (const [k, v] of index) {
  if (n++ >= 10) break;
  console.log(`    ${k} → row ${v.rowNumber}, values[0..6]=${JSON.stringify(v.values.slice(0, 7))}`);
}
