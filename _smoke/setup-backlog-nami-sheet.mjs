// Setup: crea hoja BACKLOG_NAMI en el Excel real de Camila (si no existe) y
// actualiza `inventory_excel_config.sheets.backlog.name` a 'BACKLOG_NAMI'.
//
// Objetivo (Opción C acordada 2026-10-02): preservar hoja BACKLOG humana de
// Camila intacta; Nami sincroniza TRANE en una hoja aparte, lado a lado.
//
// Idempotente: si la hoja ya existe o la config ya apunta ahí, no-op.
//
// Qué TOCA del Excel real: solo agrega una hoja vacía nueva (safe). BACKLOG
// humana queda intacta.
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/setup-backlog-nami-sheet.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }

const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const NEW_SHEET_NAME = 'BACKLOG_NAMI';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;

const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error(ctx); process.exit(1); }

console.log('── 1. Listar worksheets del Excel real ──');
const sheets = await GraphExcel.listWorksheets(ctx.token, ctx.config.location);
for (const s of sheets) console.log(`  - ${s.name} (position ${s.position})`);

const existing = sheets.find(s => s.name === NEW_SHEET_NAME);
if (existing) {
  console.log(`\n  Hoja "${NEW_SHEET_NAME}" ya existe (id=${existing.id}) → reuse`);
} else {
  console.log(`\n── 2. Crear hoja "${NEW_SHEET_NAME}" ──`);
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const { scope, itemId } = ctx.config.location;
  const prefix = scope.type === 'me'
    ? `${GRAPH}/me/drive/items/${itemId}`
    : `${GRAPH}/sites/${scope.siteId}${scope.driveId ? '/drives/' + scope.driveId : '/drive'}/items/${itemId}`;
  const r = await fetch(`${prefix}/workbook/worksheets/add`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NEW_SHEET_NAME }),
  });
  if (!r.ok) { console.error('  create sheet err:', r.status, await r.text()); process.exit(1); }
  const sheet = await r.json();
  console.log('  Hoja creada:', sheet.name, '(id=' + sheet.id + ')');
}

console.log('\n── 3. Actualizar inventory_excel_config.sheets.backlog.name ──');
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const cfg = org.inventory_excel_config;
const currentName = cfg?.sheets?.backlog?.name;
console.log('  sheets.backlog.name actual:', currentName);
if (currentName === NEW_SHEET_NAME) {
  console.log('  Ya apunta a', NEW_SHEET_NAME, '→ no-op');
} else {
  const updated = {
    ...cfg,
    sheets: { ...cfg.sheets, backlog: { ...cfg.sheets.backlog, name: NEW_SHEET_NAME, start_row: 5 } },
  };
  const { error: upErr } = await sb.from('organizations').update({ inventory_excel_config: updated }).eq('portal_email', PORTAL);
  if (upErr) { console.error('  update err:', upErr); process.exit(1); }
  console.log('  Config actualizado:', currentName, '→', NEW_SHEET_NAME);
}

console.log('\n✓ DONE. Nami ahora escribirá a', NEW_SHEET_NAME + '. Hoja BACKLOG humana intacta.');
