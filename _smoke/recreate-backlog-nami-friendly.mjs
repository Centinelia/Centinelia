// Recrea el BACKLOG del archivo-de-Nami (INVENTARIO NAMI 2026.xlsx) con las
// 12 columnas canónicas que el syncer header-driven espera. Preserva los
// datos actuales (PO, ITEM, LINES STATUS, QUANTITY, montos) y sintetiza las
// columnas faltantes (ORDER NUMBER, ORDERED DATE, LINE NUMBER, SCHEDULE
// SHIP DATE, ACCOUNT MANAGER) a partir del contexto.
//
// Opcionalmente randomiza ~5 rows para que durante la demo con Camila el
// diff PDF vs BACKLOG muestre updates visibles (no todo "unchanged").
//
// Modos:
//   preview   — imprime cambios, no toca Excel (default)
//   sandbox   — reset + setup sandbox + aplica ahí
//   real      — modifica el archivo-de-Nami en producción (requiere
//               CONFIRM_RECREATE_BACKLOG=yes)
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/recreate-backlog-nami-friendly.mjs [preview|sandbox|real]

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const mode = (process.argv[2] ?? 'preview').toLowerCase();
if (!['preview', 'sandbox', 'real'].includes(mode)) {
  console.error(`Modo inválido: ${mode}. Usa preview|sandbox|real.`);
  process.exit(1);
}
if (mode === 'real' && process.env.CONFIRM_RECREATE_BACKLOG !== 'yes') {
  console.error('Modo "real" requiere CONFIRM_RECREATE_BACKLOG=yes (safety guard).');
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;
const ctxReal = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctxReal) { console.error('ctx err:', ctxReal); process.exit(1); }

let ctx = ctxReal;
if (mode === 'sandbox') {
  const STATE_FILE = 'C:/Users/Nazre/centinelia/.ac-sandbox-state.json';
  if (!fs.existsSync(STATE_FILE)) { console.error('Falta sandbox. Corre setup-sandbox-ac.mjs primero.'); process.exit(1); }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  ctx = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };
  console.log('── Modo SANDBOX. itemId:', state.sandbox_excel_item_id.slice(0, 30), '...\n');
} else if (mode === 'real') {
  console.log('── Modo REAL. Modificando archivo-de-Nami en SharePoint. itemId:', ctx.config.location.itemId.slice(0, 30), '...\n');
} else {
  console.log('── Modo PREVIEW (no escribe). Lee del archivo-de-Nami real para preview.\n');
}

// 1. Lee BACKLOG actual (A1:N100 para ver header + ~95 data rows)
const range = await GraphExcel.readRange(ctx.token, ctx.config.location, 'BACKLOG', 'A1:N100');

// 2. Detecta header actual (fila con CUSTOMER PO NUMBER)
let headerRowIdx = -1;
for (let i = 0; i < range.values.length; i++) {
  if (range.values[i].some(v => /CUSTOMER\s*PO/i.test(String(v ?? '')))) { headerRowIdx = i; break; }
}
if (headerRowIdx < 0) { console.error('No encontré header actual con CUSTOMER PO'); process.exit(1); }
console.log(`  Header actual en fila ${headerRowIdx + 1} (0-based idx ${headerRowIdx})`);

// 3. Extrae rows actuales de datos (row después del header hasta la última no vacía)
const currentRows = [];
for (let i = headerRowIdx + 1; i < range.values.length; i++) {
  const row = range.values[i];
  if (!row.some(v => v !== '' && v !== null && v !== undefined)) continue;
  // Formato actual conocido: C=PO, D=ITEM, E=LINES STATUS, F=QUANTITY, G=BACKLOG USD, H=RESERVED, I=RESERVED USD
  const po = String(row[2] ?? '').trim();
  if (!po) continue;
  currentRows.push({
    excel_row: i + 1,
    customer_po: po,
    item:        String(row[3] ?? '').trim(),
    lines_status: String(row[4] ?? '').trim().toUpperCase(),
    quantity:    Number(row[5] ?? 0),
    backlog_usd: parseMoney(row[6]),
    reserved:    Number(row[7] ?? 0),
    reserved_usd: parseMoney(row[8]),
  });
}
console.log(`  ${currentRows.length} filas de datos leídas del BACKLOG actual.`);

function parseMoney(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// 4. Sintetiza las 5 columnas faltantes para cada fila
// LINE NUMBER: contador por OC, formato "1.1", "2.1", ...
// ORDER NUMBER: 80000000 + hash determinista de PO
// ORDERED DATE: fechas distribuidas en los últimos 6 meses (determinista por PO)
// SCHEDULE SHIP DATE: 2-4 meses después de ORDERED
// ACCOUNT MANAGER: "Valdez, Hansel Alan" (fijo per los datos reales que vimos)
const lineCounters = new Map();
function nextLine(po) {
  const n = (lineCounters.get(po) ?? 0) + 1;
  lineCounters.set(po, n);
  return `${n}.1`;
}
function orderNumber(po) {
  const h = Array.from(String(po)).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return String(80000000 + (h % 1000000));
}
function orderedDate(po, lineIdx) {
  const base = new Date('2026-04-01').getTime();
  const h = Array.from(String(po)).reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, 11);
  const dayOffset = (h + lineIdx * 7) % 180;  // 0-180 días a partir de abril
  const d = new Date(base + dayOffset * 86400000);
  return d.toISOString().slice(0, 10);
}
function shipDate(orderedIso, lineIdx) {
  const d = new Date(orderedIso);
  d.setDate(d.getDate() + 60 + (lineIdx % 30));
  return d.toISOString().slice(0, 10);
}

const canonicalRows = currentRows.map((r, idx) => {
  const line = nextLine(r.customer_po);
  const ordered = orderedDate(r.customer_po, idx);
  return {
    customer_po:    r.customer_po,
    order_number:   orderNumber(r.customer_po),
    ordered_date:   ordered,
    line_number:    line,
    item:           r.item,
    lines_status:   r.lines_status,
    ship_date:      shipDate(ordered, idx),
    quantity:       r.quantity,
    backlog_usd:    r.backlog_usd,
    reserved:       r.reserved,
    reserved_usd:   r.reserved_usd,
    account_manager: 'Valdez, Hansel Alan',
  };
});

// 5. Randomizar ~5 rows para que la demo muestre updates
// Semi-determinista: siempre modifica las mismas rows (0, 7, 14, 21, 28) para
// que sea reproducible y el PDF que tengas de referencia muestre esos diffs.
const STATUS_SWAP = { AWAITING_SHIPPING: 'AWAITING_SUPPLY', AWAITING_SUPPLY: 'AWAITING_SHIPPING', PO_OPEN: 'AWAITING_SUPPLY' };
const randomizedIndices = [0, 7, 14, 21, 28].filter(i => i < canonicalRows.length);
const changesLog = [];
for (const i of randomizedIndices) {
  const r = canonicalRows[i];
  const before = { ...r };
  // Cambia LINES STATUS
  const newStatus = STATUS_SWAP[r.lines_status] ?? 'AWAITING_SUPPLY';
  r.lines_status = newStatus;
  // En rows pares, también cambia RESERVED
  if (i % 2 === 0) {
    r.reserved = r.reserved > 0 ? 0 : 2;
    r.reserved_usd = r.reserved === 0 ? 0 : r.backlog_usd;
  }
  changesLog.push({ idx: i, po: r.customer_po, item: r.item, before: { status: before.lines_status, reserved: before.reserved }, after: { status: r.lines_status, reserved: r.reserved } });
}

console.log(`\n── Randomización planeada (${changesLog.length} rows) ──`);
changesLog.forEach(c => {
  console.log(`  idx ${c.idx} PO=${c.po} ITEM=${c.item}: STATUS ${c.before.status} → ${c.after.status}, RESERVED ${c.before.reserved} → ${c.after.reserved}`);
});

console.log(`\n── Preview del BACKLOG final (${canonicalRows.length} rows en 12 columnas) ──`);
console.log('  Header: CUSTOMER PO NUMBER | ORDER NUMBER | ORDERED DATE | LINE NUMBER | ITEM | LINES STATUS | SCHEDULE SHIP DATE | QUANTITY | BACKLOG USD | RESERVED | RESERVED BACKLOG USD | ACCOUNT MANAGER');
console.log('  Primeras 3 filas:');
canonicalRows.slice(0, 3).forEach(r => {
  console.log(`    ${r.customer_po} | ${r.order_number} | ${r.ordered_date} | ${r.line_number} | ${r.item} | ${r.lines_status} | ${r.ship_date} | ${r.quantity} | ${r.backlog_usd} | ${r.reserved} | ${r.reserved_usd} | ${r.account_manager}`);
});
console.log('  Últimas 2 filas:');
canonicalRows.slice(-2).forEach(r => {
  console.log(`    ${r.customer_po} | ${r.order_number} | ${r.ordered_date} | ${r.line_number} | ${r.item} | ${r.lines_status} | ${r.ship_date} | ${r.quantity} | ${r.backlog_usd} | ${r.reserved} | ${r.reserved_usd} | ${r.account_manager}`);
});

if (mode === 'preview') {
  console.log('\n✓ PREVIEW completo. No se escribió nada. Vuelve a correr con "sandbox" o "real" para aplicar.');
  process.exit(0);
}

// 6. ESCRITURA
// Columnas: usamos C-N (preserva A y B vacías como está el formato actual).
// Header row: la misma fila donde estaba el header actual (preserva filas 1-3 de Camila).
const headerRowNumber = headerRowIdx + 1;
const dataStartRow = headerRowNumber + 1;
const dataEndRow = dataStartRow + canonicalRows.length - 1;

const headerValues = [[
  'CUSTOMER PO NUMBER', 'ORDER NUMBER', 'ORDERED DATE', 'LINE NUMBER',
  'ITEM', 'LINES STATUS', 'SCHEDULE SHIP DATE', 'QUANTITY',
  'BACKLOG USD', 'RESERVED', 'RESERVED BACKLOG USD', 'ACCOUNT MANAGER',
]];
const dataValues = canonicalRows.map(r => [
  r.customer_po, r.order_number, r.ordered_date, r.line_number,
  r.item, r.lines_status, r.ship_date, r.quantity,
  r.backlog_usd, r.reserved, r.reserved_usd, r.account_manager,
]);

// Primero limpia cualquier dato residual más allá de dataEndRow (hasta row 100)
// para no dejar basura mezclada.
const clearRows = [];
for (let r = dataEndRow + 1; r <= 100; r++) {
  clearRows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
}

console.log(`\n── Escribiendo al Excel ──`);
console.log(`  Header en C${headerRowNumber}:N${headerRowNumber}`);
console.log(`  Datos  en C${dataStartRow}:N${dataEndRow} (${canonicalRows.length} rows)`);
console.log(`  Clear  en C${dataEndRow + 1}:N100 (${clearRows.length} rows vacías para limpiar residual)`);

await GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
  await GraphExcel.patchRange(ctx.token, session, 'BACKLOG', `C${headerRowNumber}:N${headerRowNumber}`, headerValues);
  await GraphExcel.patchRange(ctx.token, session, 'BACKLOG', `C${dataStartRow}:N${dataEndRow}`, dataValues);
  if (clearRows.length > 0) {
    await GraphExcel.patchRange(ctx.token, session, 'BACKLOG', `C${dataEndRow + 1}:N100`, clearRows);
  }
});
console.log(`\n✓ BACKLOG recreado en modo ${mode}. ${canonicalRows.length} filas en 12 columnas, ${changesLog.length} rows randomizadas para demo.`);
