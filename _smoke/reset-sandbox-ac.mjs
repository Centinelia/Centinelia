// Borra la carpeta sandbox completa de OneDrive de Camila para empezar fresh.
// Útil cuando el sandbox acumuló basura (TEST-E2E rows, hojas intermedias) y
// queremos un snapshot limpio del Excel real actual.
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/reset-sandbox-ac.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const STATE_FILE = 'C:/Users/Nazre/centinelia/.ac-sandbox-state.json';
if (!fs.existsSync(STATE_FILE)) {
  console.log('No hay sandbox state → nada que borrar.');
  process.exit(0);
}
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(state.portal, sb, state.nami_agent_id);
if ('error' in ctx) { console.error(ctx); process.exit(1); }

console.log('Borrando carpeta sandbox:', state.sandbox_folder_id);
const GRAPH = 'https://graph.microsoft.com/v1.0';
const { scope } = state;
const drive = `${GRAPH}/sites/${scope.siteId}${scope.driveId ? '/drives/' + scope.driveId : '/drive'}`;
const r = await fetch(`${drive}/items/${state.sandbox_folder_id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${ctx.token}` },
});
if (!r.ok && r.status !== 404) {
  console.error('delete err:', r.status, await r.text());
  process.exit(1);
}
console.log('✓ Carpeta borrada (' + r.status + ')');

fs.unlinkSync(STATE_FILE);
console.log('✓ State file borrado:', STATE_FILE);
