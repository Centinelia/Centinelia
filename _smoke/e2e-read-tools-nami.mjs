// Smoke test de las 5 tools nuevas de lectura/memoria de Nami contra el REAL
// (read-only, cero riesgo). Verifica:
//   1. inv_buscar_por_oc con una OC real
//   2. inv_buscar_por_fact_trane con una factura real
//   3. inv_estado_general (overview)
//   4. inv_consultar_backlog (BACKLOG actual)
//   5. inv_buscar_mis_acciones (log de mutations)
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/e2e-read-tools-nami.mjs

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { executeAgentTool } = await import('../src/lib/tools/executor.ts');
const { data: agentRow } = await sb.from('voice_agents').select('*').eq('id', NAMI).maybeSingle();
const nameCtx = {
  agentId: NAMI, portalEmail: PORTAL, agentName: agentRow.agent_name, businessName: agentRow.business_name,
  portalToken: 'smoke', agent: agentRow, supabase: sb, channel: 'chat',
};

const results = {};
function pass(step, msg) { console.log(`  ✓ ${step}: ${msg}`); results[step] = { ok: true, msg }; }
function fail(step, msg) { console.log(`  ✗ ${step}: ${msg}`); results[step] = { ok: false, msg }; }

console.log('── inv_estado_general ──');
const r1 = await executeAgentTool('inv_estado_general', {}, nameCtx);
if (r1.ok && r1.total_equipos > 100) pass('estado_general', `total=${r1.total_equipos}, en_almacen=${r1.kpi.en_almacen}, valor MX=$${r1.kpi.valor_inventario_mx}`);
else fail('estado_general', `Esperado total > 100; got: ${JSON.stringify(r1).slice(0, 200)}`);

console.log('\n── inv_consultar_backlog ──');
const r2 = await executeAgentTool('inv_consultar_backlog', {}, nameCtx);
if (r2.ok && r2.total_lineas > 0) pass('consultar_backlog', `${r2.total_lineas} líneas, ${r2.total_ocs} OCs, USD $${r2.total_backlog_usd}`);
else fail('consultar_backlog', JSON.stringify(r2).slice(0, 300));

// Buscar una OC real del Excel. Primero inv_buscar_por_modelo para ver qué OCs hay
console.log('\n── inv_buscar_por_oc (sample de una OC real del Excel) ──');
// Pedimos una OC conocida — las 4 series TEST* en sandbox usan OC07119, pero prod puede no tener.
// Usamos una OC random del Excel real: tomamos del estado general.
const histSample = await (await import('../src/lib/inventory/adapter.ts')).listHistorico(
  await (await import('../src/lib/inventory/adapter.ts')).resolveInventoryContext(PORTAL, sb, NAMI)
);
const ocSample = histSample.find(r => r.values.oc && String(r.values.oc).trim())?.values.oc;
if (ocSample) {
  const r3 = await executeAgentTool('inv_buscar_por_oc', { oc: String(ocSample) }, nameCtx);
  if (r3.ok && r3.encontrado) pass('buscar_por_oc', `OC ${r3.oc}: ${r3.total} equipos. Estatus: ${Object.entries(r3.resumen.por_estatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  else fail('buscar_por_oc', JSON.stringify(r3).slice(0, 300));
} else {
  fail('buscar_por_oc', 'No había OC sample en Excel para probar');
}

console.log('\n── inv_buscar_por_fact_trane (sample de factura real) ──');
const factSample = histSample.find(r => r.values.folio_compra && String(r.values.folio_compra).trim())?.values.folio_compra;
if (factSample) {
  const r4 = await executeAgentTool('inv_buscar_por_fact_trane', { fact_trane: String(factSample) }, nameCtx);
  if (r4.ok && r4.encontrado) pass('buscar_por_fact_trane', `Factura ${r4.fact_trane}: ${r4.total} equipos, USD $${r4.resumen.total_usd}, ${r4.resumen.pagada ? 'PAGADA' : 'PENDIENTE'}`);
  else fail('buscar_por_fact_trane', JSON.stringify(r4).slice(0, 300));
}

console.log('\n── inv_buscar_mis_acciones (últimos 30 días) ──');
const r5 = await executeAgentTool('inv_buscar_mis_acciones', { dias: 30 }, nameCtx);
if (r5.ok) pass('buscar_mis_acciones', `${r5.total_acciones} acciones en últimos 30 días. Tools: ${Object.keys(r5.resumen_por_tool).join(', ')}`);
else fail('buscar_mis_acciones', JSON.stringify(r5).slice(0, 300));

const ok = Object.values(results).filter(r => r.ok).length;
const total = Object.keys(results).length;
console.log(`\n═══ ${ok}/${total} verificaciones OK ═══`);
process.exit(ok === total ? 0 : 1);
