// Verifica qué quedó en la hoja BACKLOG del sandbox DESPUÉS del E2E.
// Expectativa post-fix: solo las 45 Nami en A5:H49, R50+ vacías.
// Realidad actual (bug): R5-R49 Nami + R50-R51 residuales humanas.

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
const ctx = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

const range = await GraphExcel.readRange(ctx.token, ctx.config.location, 'BACKLOG', 'A1:H60');
console.log('Hoja BACKLOG del sandbox tras E2E:');
range.values.forEach((row, i) => {
  const rowNum = i + 1;
  const hasContent = row.some(v => v !== '' && v !== null && v !== undefined);
  if (!hasContent) return;
  const preview = row.map(v => {
    const s = String(v ?? '').trim();
    return s.length > 18 ? s.slice(0, 16) + '..' : s;
  }).join(' | ');
  console.log(`  R${rowNum}: ${preview}`);
});
