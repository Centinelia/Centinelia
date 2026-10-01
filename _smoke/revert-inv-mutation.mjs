// Rollback de una mutación específica del audit log.
// Uso: node _smoke/revert-inv-mutation.mjs <mutation_id>
// Restaura before_state en Excel + inserta nueva row 'manual_revert' en audit.
//
// IMPORTANTE: Este script escribe en el Excel real en SharePoint/OneDrive.
// Requiere Node.js con soporte de TypeScript o tsx. Ejecutar con:
//   ALLOW_PROD_WRITE=true npx tsx _smoke/revert-inv-mutation.mjs <mutation_id>
// O bien (Node.js 22.6+):
//   ALLOW_PROD_WRITE=true node --experimental-strip-types _smoke/revert-inv-mutation.mjs <mutation_id>
// O pasar flag --yes en línea de comandos:
//   npx tsx _smoke/revert-inv-mutation.mjs <mutation_id> --yes

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const [,, MUTATION_ID] = process.argv;
if (!MUTATION_ID) { console.error('Uso: npx tsx _smoke/revert-inv-mutation.mjs <mutation_id>'); process.exit(1); }

// Gate de seguridad: requiere permiso explícito para escribir en prod
if (process.env.ALLOW_PROD_WRITE !== 'true' && !process.argv.includes('--yes')) {
  console.error('Este script escribe al Excel real en SharePoint. Requiere ALLOW_PROD_WRITE=true o flag --yes.');
  console.error('Uso: ALLOW_PROD_WRITE=true npx tsx _smoke/revert-inv-mutation.mjs <mutation_id>');
  process.exit(1);
}

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: m, error } = await sb.from('inventory_mutations_log').select('*').eq('id', MUTATION_ID).single();
if (error || !m) { console.error('no encontrado:', MUTATION_ID); process.exit(1); }
console.log('mutation:', JSON.stringify({ id: m.id, tool: m.tool_name, serie: m.serie, portal: m.portal_email, success: m.success }, null, 2));

if (!m.success) { console.error('la mutación no fue exitosa, no hay nada que revertir'); process.exit(1); }

// Importamos adapter dinámico — usa el mismo flow que el executor
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(m.portal_email, sb, m.agent_id);
if ('error' in ctx) { console.error('no pude resolver contexto:', ctx.message); process.exit(1); }

if (m.before_state === null && m.tool_name === 'inv_agregar_equipo') {
  console.error('TODO: implementar DELETE row por table_row_index (Graph deleteTableRow). Fuera de scope Fase 1; manual via Excel por ahora.');
  process.exit(1);
}

// patch cada columna del before_state
const headers = await adapter.GraphExcel.getTableHeader(ctx.token, ctx.config.location, ctx.config.sheets.historico.table);
await adapter.GraphExcel.withSession(ctx.token, ctx.config.location, async session => {
  for (const col of m.patched_columns ?? []) {
    const idx = headers.findIndex(h => String(h).trim().toUpperCase() === col.toUpperCase());
    if (idx < 0) { console.warn('columna no encontrada:', col); continue; }
    const value = m.before_state[col];
    const letter = String.fromCharCode(65 + idx); // simplificado para col <= 26
    const abs = m.table_row_index + 2;
    await adapter.GraphExcel.patchCell(ctx.token, session, ctx.config.sheets.historico.name, `${letter}${abs}`, value);
    console.log(`reverted ${col} -> ${JSON.stringify(value)}`);
  }
});

await sb.from('inventory_mutations_log').insert({
  portal_email: m.portal_email, agent_id: m.agent_id, tool_name: 'manual_revert',
  serie: m.serie, table_row_index: m.table_row_index,
  before_state: m.after_state, after_state: m.before_state,
  patched_columns: m.patched_columns, metadata: { reverted_id: m.id },
  ops_charged: 0, success: true, error_code: null,
});
console.log('DONE. Audit row insertado con reverted_id =', m.id);
