// Quick retry solo del inv_actualizar_estatus contra sandbox.
// Para discriminar Graph 503 transiente vs bug reproducible.
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/retry-estatus-sandbox.mjs

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
if ('error' in ctxReal) { console.error('ctx err:', ctxReal); process.exit(1); }

const ctx = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

// Serie que falló: 2422H8393A — intentar PENDIENTE
const SERIE = '2422H8393A';
console.log('Retry patchEstatusBySerie:', SERIE, '→ PENDIENTE');
try {
  const r = await adapter.patchEstatusBySerie(ctx, SERIE, 'PENDIENTE');
  console.log('Result:', JSON.stringify({ ok: r.ok, no_op: r.no_op, estatus_anterior: r.estatus_anterior, estatus_nuevo: r.estatus_nuevo, patched_columns: r.patched_columns }));
  if (r.ok) console.log('\n✓ 503 anterior fue TRANSIENTE. Flow correcto.');
} catch (e) {
  console.error('✗ FAIL (reproducible):', e.message);
}
