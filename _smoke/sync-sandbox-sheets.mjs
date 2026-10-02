// Asegura que el sandbox tiene las mismas hojas que el Excel real.
// Específicamente: crear BACKLOG_NAMI en sandbox si no existe (fue copiado
// antes de que agregáramos esa hoja al real).
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/sync-sandbox-sheets.mjs

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

const ctxReal = await adapter.resolveInventoryContext(state.portal, sb, state.nami_agent_id);
const ctxSandbox = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

const sheets = await GraphExcel.listWorksheets(ctxSandbox.token, ctxSandbox.config.location);
console.log('Sandbox worksheets:');
for (const s of sheets) console.log('  -', s.name);

if (sheets.find(s => s.name === 'BACKLOG_NAMI')) {
  console.log('\n✓ BACKLOG_NAMI ya existe en sandbox. No-op.');
  process.exit(0);
}

console.log('\nCreando BACKLOG_NAMI en sandbox...');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const { scope, itemId } = ctxSandbox.config.location;
const prefix = `${GRAPH}/sites/${scope.siteId}${scope.driveId ? '/drives/' + scope.driveId : '/drive'}/items/${itemId}`;
const r = await fetch(`${prefix}/workbook/worksheets/add`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ctxSandbox.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'BACKLOG_NAMI' }),
});
if (!r.ok) { console.error('fail:', r.status, await r.text()); process.exit(1); }
const sheet = await r.json();
console.log('✓ Hoja creada:', sheet.name);
