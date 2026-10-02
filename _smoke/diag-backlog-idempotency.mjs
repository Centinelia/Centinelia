// Diag: compara celda-a-celda qué difiere entre parsed vs post-write del BACKLOG.
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/diag-backlog-idempotency.mjs

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
const ctxReal = await adapter.resolveInventoryContext(state.portal, sb, state.nami_agent_id);
const ctx = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

const parser = await import('../src/lib/inventory/backlog-parser.ts');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');
const pdfBytes = new Uint8Array(fs.readFileSync('C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf'));
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', state.portal).maybeSingle();
const pwd = org.inventory_excel_config.backlog_trane.pdf_password;

const parsed = await parser.parseBacklogPdf(pdfBytes, pwd);
console.log('Parsed rows:', parsed.rows.length);

const sheetCfg = ctx.config.sheets.backlog;
const existing = await syncer.readBacklogIndex(ctx, sheetCfg);
console.log('Existing rows en BACKLOG post-sync:', existing.size);

// Comparar primera row
const first = parsed.rows[0];
const newValues = syncer.rowToExcelValues(first);
const key = syncer.rowKey(first);
const existingRow = existing.get(key);

console.log('\n── Fila:', key, '──');
console.log('rowToExcelValues (lo que escribiríamos ahora):');
newValues.forEach((v, i) => console.log(`  [${i}] type=${typeof v} value=${JSON.stringify(v)}`));
console.log('\nExcel reads back (lo que leímos del sandbox):');
if (existingRow) {
  existingRow.values.forEach((v, i) => console.log(`  [${i}] type=${typeof v} value=${JSON.stringify(v)}`));
}

console.log('\n── Diferencias celda-a-celda ──');
if (existingRow) {
  const HEADERS = ['OC AC', 'OC TRANE', 'FECHA REGISTRO', 'MODELO', 'CANTIDAD', 'ESTATUS TRANE', 'FECHA ENTREGA', 'NOTAS'];
  for (let i = 0; i < 8; i++) {
    const w = newValues[i];
    const r = existingRow.values[i];
    const wn = normalizeCell(w);
    const rn = normalizeCell(r);
    const diff = wn !== rn;
    console.log(`  ${diff ? '✗' : '✓'} [${i}] ${HEADERS[i]}: written=${JSON.stringify(w)} (${typeof w})  vs  read=${JSON.stringify(r)} (${typeof r})  →  norm "${wn}" vs "${rn}"`);
  }
}

function normalizeCell(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}
