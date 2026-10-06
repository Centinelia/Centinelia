// Compara una fila del PDF contra lo que acabamos de escribir al sandbox
// para identificar qué difiere y rompe idempotency.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const state = JSON.parse(fs.readFileSync('C:/Users/Nazre/centinelia/.ac-sandbox-state.json','utf8'));
const adapter = await import('../src/lib/inventory/adapter.ts');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');
const parser = await import('../src/lib/inventory/backlog-parser.ts');

const ctxReal = await adapter.resolveInventoryContext('camila@acproyectos.com', sb, '3245bc1f-89e1-4949-bbed-71a18b05e344');
const ctx = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

const resolved = await syncer.resolveColumns(ctx, { name: 'BACKLOG', start_row: 5 });
const { index } = await syncer.readBacklogIndex(ctx, { name: 'BACKLOG', start_row: 5 });

const PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';
const bytes = new Uint8Array(fs.readFileSync(PDF));
const password = ctx.config.backlog_trane.pdf_password;
const parsed = await parser.parseBacklogPdf(bytes, password);

const firstPdfRow = parsed.rows[0];
const key = syncer.rowKey(firstPdfRow, resolved);
console.log('PDF row key:', key);
console.log('PDF row:', JSON.stringify(firstPdfRow, null, 2));

const existingEntry = index.get(key);
if (!existingEntry) {
  console.log('\n⚠ NO existe key en Excel. All PDF rows added.');
  console.log('Keys existentes en Excel (primeras 5):');
  let n = 0;
  for (const k of index.keys()) { if (n++ >= 5) break; console.log(' ', k); }
} else {
  console.log('\nExisting en Excel (row', existingEntry.rowNumber, '):');
  const headers = ['CUST_PO','ORD_NUM','ORD_DATE','LINE_NUM','ITEM','LINES_STAT','SHIP_DATE','QUANTITY','BACK_USD','RESERVED','RES_USD','ACC_MGR'];
  existingEntry.values.forEach((v, i) => console.log(`  [${i}] ${headers[i] ?? '?'} = ${JSON.stringify(v)} (${typeof v})`));

  // Compara contra lo que el syncer construiría
  const resolved2 = resolved;
  // Simular buildRowForResolvedWidth
  const cells = syncer.rowToColumnValues(firstPdfRow, resolved);
  const rangeWidth = resolved.lastDataCol - resolved.firstDataCol + 1;
  const newRow = new Array(rangeWidth).fill('');
  for (let i = 0; i < rangeWidth; i++) newRow[i] = existingEntry.values[i] ?? '';
  for (const [absIdx, value] of cells) {
    const localIdx = absIdx - resolved.firstDataCol;
    if (localIdx >= 0 && localIdx < rangeWidth) newRow[localIdx] = value;
  }
  console.log('\nNewRow (lo que syncer escribiría):');
  newRow.forEach((v, i) => console.log(`  [${i}] ${headers[i] ?? '?'} = ${JSON.stringify(v)} (${typeof v})`));

  console.log('\nDiff cells:');
  for (let i = 0; i < rangeWidth; i++) {
    const a = existingEntry.values[i];
    const b = newRow[i];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      console.log(`  [${i}] ${headers[i]}: existing=${JSON.stringify(a)} vs new=${JSON.stringify(b)}`);
    }
  }

  console.log('\nrowsEqualResolved?', syncer.rowsEqualResolved(existingEntry.values, newRow, resolved));
}
