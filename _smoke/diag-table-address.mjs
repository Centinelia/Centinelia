// Verifica la address de Tabla6 (dónde empieza en el sheet).
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const state = JSON.parse(fs.readFileSync('C:/Users/Nazre/centinelia/.ac-sandbox-state.json', 'utf8'));

const adapter = await import('../src/lib/inventory/adapter.ts');
const ctxReal = await adapter.resolveInventoryContext(PORTAL, sb, state.nami_agent_id);
const ctxSandbox = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

const { scope } = ctxSandbox.config.location;
const prefix = `https://graph.microsoft.com/v1.0/sites/${scope.siteId}/drives/${scope.driveId}/items/${ctxSandbox.config.location.itemId}`;

async function g(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${ctxSandbox.token}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const tableName = ctxSandbox.config.sheets.historico.table;
console.log('── Tabla:', tableName);

const header = await g(`${prefix}/workbook/tables/${encodeURIComponent(tableName)}/headerRowRange?$select=address,rowIndex,columnIndex,rowCount,columnCount`);
console.log('  headerRowRange.address:    ', header.address);
console.log('  headerRowRange.rowIndex:   ', header.rowIndex);
console.log('  headerRowRange.columnIndex:', header.columnIndex);

const body = await g(`${prefix}/workbook/tables/${encodeURIComponent(tableName)}/dataBodyRange?$select=address,rowIndex,columnIndex,rowCount,columnCount`);
console.log('\n  dataBodyRange.address:  ', body.address);
console.log('  dataBodyRange.rowIndex: ', body.rowIndex, '(0-based en el sheet)');
console.log('  dataBodyRange.rowCount: ', body.rowCount);

// Esperado: si header en row 1 (rowIndex=0) y data desde row 2 (rowIndex=1),
// entonces abs = (tableRowIndex) + (dataBodyRange.rowIndex) + 1 (Excel 1-based)
console.log('\n→ Para patchCell: abs = tableRowIndex +', body.rowIndex + 1, '(no +2)');
