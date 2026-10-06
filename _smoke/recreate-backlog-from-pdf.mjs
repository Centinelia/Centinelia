// Reconstruye el BACKLOG del archivo-de-Nami desde el PDF local (fuente de
// verdad canónica), ignorando el estado actual (que puede estar corrupto por
// intentos previos). Randomiza 5 rows para que el demo muestre updates.
//
// Uso: ALLOW_PROD_SMOKE=true CONFIRM_RECREATE_BACKLOG=yes npx tsx _smoke/recreate-backlog-from-pdf.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
if (process.env.CONFIRM_RECREATE_BACKLOG !== 'yes') { console.error('Requiere CONFIRM_RECREATE_BACKLOG=yes'); process.exit(1); }

const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const PDF_REF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';

const adapter = await import('../src/lib/inventory/adapter.ts');
const parser = await import('../src/lib/inventory/backlog-parser.ts');
const GraphExcel = adapter.GraphExcel;
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error(ctx); process.exit(1); }

console.log('── Parseando PDF ──');
const bytes = new Uint8Array(fs.readFileSync(PDF_REF));
const parsed = await parser.parseBacklogPdf(bytes, ctx.config.backlog_trane.pdf_password);
console.log(`  ${parsed.rows.length} rows del PDF`);

// Convertir cada BacklogRow del parser → 12 campos canónicos
const rows = parsed.rows.map(r => ({
  customer_po:    r.customer_po_number ?? '',
  order_number:   r.order_number ?? '',
  ordered_date:   r.ordered_date ?? '',
  line_number:    r.line_number ?? '',
  item:           r.item ?? '',
  lines_status:   r.lines_status ?? '',
  ship_date:      r.schedule_ship_date ?? '',
  quantity:       r.quantity ?? 0,
  backlog_usd:    r.backlog_usd ?? 0,
  reserved:       r.reserved ?? 0,
  reserved_usd:   r.reserved_backlog_usd ?? 0,
  account_manager: r.account_manager ?? 'Valdez, Hansel Alan',
}));

// Randomizar 5 rows (determinista para que el PDF original matchee)
const STATUS_SWAP = { AWAITING_SHIPPING: 'AWAITING_SUPPLY', AWAITING_SUPPLY: 'AWAITING_SHIPPING', PO_OPEN: 'AWAITING_SUPPLY' };
const indices = [0, 7, 14, 21, 28].filter(i => i < rows.length);
console.log('\n── Randomización (5 rows) ──');
indices.forEach(i => {
  const r = rows[i];
  const before = { status: r.lines_status, reserved: r.reserved };
  r.lines_status = STATUS_SWAP[r.lines_status] ?? 'AWAITING_SUPPLY';
  if (i % 2 === 0) {
    r.reserved = r.reserved > 0 ? 0 : 2;
    r.reserved_usd = r.reserved === 0 ? 0 : r.backlog_usd;
  }
  console.log(`  idx ${i} PO=${r.customer_po} ITEM=${r.item}: STATUS ${before.status} → ${r.lines_status}, RESERVED ${before.reserved} → ${r.reserved}`);
});

// Preview últimas 3 filas
console.log('\n── Preview últimas 3 filas ──');
rows.slice(-3).forEach(r => {
  console.log(`  ${r.customer_po} | ${r.order_number} | ${r.ordered_date} | ${r.line_number} | ${r.item} | ${r.lines_status} | ${r.ship_date} | ${r.quantity} | ${r.backlog_usd} | ${r.reserved} | ${r.reserved_usd} | ${r.account_manager}`);
});

// Escribir al Excel real: header en C4, data desde C5
const headerRow = 4;
const dataStart = 5;
const dataEnd = dataStart + rows.length - 1;
const headerValues = [[
  'CUSTOMER PO NUMBER', 'ORDER NUMBER', 'ORDERED DATE', 'LINE NUMBER',
  'ITEM', 'LINES STATUS', 'SCHEDULE SHIP DATE', 'QUANTITY',
  'BACKLOG USD', 'RESERVED', 'RESERVED BACKLOG USD', 'ACCOUNT MANAGER',
]];
const dataValues = rows.map(r => [
  r.customer_po, r.order_number, r.ordered_date, r.line_number,
  r.item, r.lines_status, r.ship_date, r.quantity,
  r.backlog_usd, r.reserved, r.reserved_usd, r.account_manager,
]);
const clearRows = [];
for (let i = dataEnd + 1; i <= 100; i++) {
  clearRows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
}

console.log(`\n── Escribiendo al archivo-de-Nami REAL ──`);
console.log(`  Header en C${headerRow}:N${headerRow}`);
console.log(`  Datos  en C${dataStart}:N${dataEnd} (${rows.length} rows)`);
console.log(`  Clear  en C${dataEnd + 1}:N100 (limpiar residual)`);

await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
  await GraphExcel.patchRange(ctx.token, session, 'BACKLOG', `C${headerRow}:N${headerRow}`, headerValues);
  await GraphExcel.patchRange(ctx.token, session, 'BACKLOG', `C${dataStart}:N${dataEnd}`, dataValues);
  await GraphExcel.patchRange(ctx.token, session, 'BACKLOG', `C${dataEnd + 1}:N100`, clearRows);
});
console.log(`\n✓ BACKLOG reconstruido desde PDF. ${rows.length} filas, 5 randomizadas.`);
