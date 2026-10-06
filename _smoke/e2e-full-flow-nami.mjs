// E2E smoke exhaustivo del flujo completo Nami (2026-10-06, en vivo con Camila).
// 9 pasos:
//   1. inv_procesar_oc_qb              → crea 4 filas pre-registradas
//   2. inv_notificar_trane_registro_oc → borrador correo Isabel
//   3. inv_procesar_factura_trane      → MATCH + UPDATE las 4 filas con series
//   4. inv_registrar_tc_factura        → aplica TC + COSTO MX
//   5. inv_actualizar_estatus ALMACEN  → RECIBO2=1 + SALIDA=1
//   6. inv_asignar_cliente             → cliente + SEPARADO
//   7. inv_registrar_salida            → ENTREGADO + CONTROL=1 + SALIDA=0
//   8. inv_procesar_factura_venta_sf   → FACTURA + venta columns
//   9. inv_definir_familia_modelo      → aprende catálogo + verifica
// Riesgo: cero sobre Excel real (ctx override itemId sandbox).

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const STATE_FILE = 'C:/Users/Nazre/centinelia/.ac-sandbox-state.json';
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = state.portal;
const NAMI   = state.nami_agent_id;
const RUN_TAG = 'e2e-full-' + Date.now();
console.log('── RUN_TAG:', RUN_TAG, '─────────────────────────────────\n');

const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;
const { executeAgentTool } = await import('../src/lib/tools/executor.ts');

const ctxReal = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctxReal) { console.error('ctx err:', ctxReal); process.exit(1); }

// Override itemId to sandbox for direct adapter calls (used for verification only)
const ctxSandbox = { ...ctxReal, config: { ...ctxReal.config, location: { scope: ctxReal.config.location.scope, itemId: state.sandbox_excel_item_id } } };

const { data: agentRow } = await sb.from('voice_agents').select('*').eq('id', NAMI).maybeSingle();

// Para que executeAgentTool llegue al sandbox, mocheamos el itemId del config
// temporalmente en la DB. Al final lo revertimos.
console.log('── Setup: redirigir inventory_excel_config.location.itemId → sandbox para esta corrida ──');
const { data: orgPre } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const originalItemId = orgPre.inventory_excel_config.location.itemId;
const sandboxConfig = {
  ...orgPre.inventory_excel_config,
  location: { ...orgPre.inventory_excel_config.location, itemId: state.sandbox_excel_item_id },
};
await sb.from('organizations').update({ inventory_excel_config: sandboxConfig }).eq('portal_email', PORTAL);
console.log('  config apunta a sandbox temporalmente');
console.log('  (al terminar revertimos a real:', originalItemId.slice(0, 30) + '...)');

const nameCtx = {
  agentId: NAMI, portalEmail: PORTAL,
  agentName: agentRow.agent_name, businessName: agentRow.business_name,
  portalToken: 'smoke', agent: agentRow, supabase: sb, channel: 'chat',
};

const results = {};
let failedSteps = 0;

function pass(step, msg) { console.log(`  ✓ ${step}: ${msg}`); results[step] = { ok: true, msg }; }
function fail(step, msg) { console.log(`  ✗ ${step}: ${msg}`); results[step] = { ok: false, msg }; failedSteps++; }

// Graph API tiene propagación eventual (puede llegar a 20-30s para reads
// cross-session). Para verificaciones, retry agresivo.
async function verifyWithRetry(label, verifyFn, maxTries = 8, waitMs = 5000) {
  for (let i = 0; i < maxTries; i++) {
    const result = await verifyFn();
    if (result.ok) return result;
    if (i < maxTries - 1) {
      console.log(`    (retry ${i + 1}/${maxTries} para ${label}, esperando ${waitMs}ms…)`);
      await new Promise(res => setTimeout(res, waitMs));
    }
  }
  return await verifyFn();  // último intento, devuelve lo que sea
}

// Series mock: 12 chars, terminan en letra → cumplen SERIE_RE
const SERIES_1 = ['TEST01234ABC', 'TEST02345ABC'];  // modelo TWE24043BAAP01H
const SERIES_2 = ['TEST03456ABC', 'TEST04567ABC'];  // modelo TTA24043DAAE02P

try {

// ═══════════════════════════════════════════════════════════════════════════
// PASO 1 — inv_procesar_oc_qb
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 1: inv_procesar_oc_qb (OC 7119, 4 piezas) ──');
const r1 = await executeAgentTool('inv_procesar_oc_qb', {
  oc_numero: '7119',
  fecha_oc: '2026-09-17',
  items: [
    { modelo: 'TWE24043BAAP01H', cantidad: 2, usd_unit: 5716.40, descripcion: 'Manejadora Convertible Trane 20TR 2C R410 230/3/60' },
    { modelo: 'TTA24043DAAE02P', cantidad: 2, usd_unit: 7169.37, descripcion: 'Condensadora Solo Frio Descarga Vtcl Trane 20TR 2C R410 230/3/60' },
  ],
}, nameCtx);
if (r1.ok && r1.total_filas === 4 && r1.oc_numero === 'OC07119') pass('oc_qb', `${r1.total_filas} filas, OC=${r1.oc_numero}`);
else fail('oc_qb', `Esperado 4 filas OC07119, got: ${JSON.stringify(r1)}`);

// Verifico que las filas tengan FAMILIA, TR, REF, VOLTS inferidos
const histRows1 = await adapter.listHistorico(ctxSandbox);
const matching1 = histRows1.filter(r => String(r.values.oc ?? '').trim() === 'OC07119');
console.log(`    Filas en INVENTARIO con OC07119: ${matching1.length}`);
if (matching1.length > 0) {
  const sample = matching1[0];
  console.log(`    Sample row: MODELO=${sample.values.modelo}, FAMILIA=${sample.values.familia}, estatus=${sample.values.estatus}, bodega=${sample.values.bodega}, cliente=${sample.values.cliente}, usd=${sample.values.usd}`);
  const camposOk = sample.values.familia && sample.values.estatus === 'PEDIDO' && sample.values.bodega === 'ASIGNAR' && sample.values.cliente === '-';
  if (camposOk) pass('oc_qb_fields', 'FAMILIA + ESTATUS=PEDIDO + BODEGA=ASIGNAR + CLIENTE=- OK');
  else fail('oc_qb_fields', `Campos no cuadran: familia=${sample.values.familia}, estatus=${sample.values.estatus}, bodega=${sample.values.bodega}, cliente=${sample.values.cliente}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PASO 2 — inv_notificar_trane_registro_oc (dry — solo borrador)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 2: inv_notificar_trane_registro_oc (dry borrador) ──');
const r2 = await executeAgentTool('inv_notificar_trane_registro_oc', {
  oc_numero: 'OC07119',
  items: [
    { modelo: 'TWE24043BAAP01H', cantidad: 2 },
    { modelo: 'TTA24043DAAE02P', cantidad: 2 },
  ],
  enviar: false,
}, nameCtx);
if (r2.ok && r2.draft?.to === 'isabel.galvan@trane.com') pass('notif_isabel', `borrador a ${r2.draft.to}, subject OK`);
else fail('notif_isabel', `Draft inesperado: ${JSON.stringify(r2)}`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 3 — inv_procesar_factura_trane (MATCH contra pre-registradas)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 3: inv_procesar_factura_trane (MATCH, no debe duplicar) ──');
const xmlTrane = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-09-20T10:00:00" Folio="80099999" TipoCambio="1">
  <cfdi:Emisor Rfc="TRA670207Q71" Nombre="TRANE"/>
  <cfdi:Receptor Rfc="AAP010601S21" Nombre="AC Proyectos"/>
  <cfdi:Conceptos>
    <cfdi:Concepto NoIdentificacion="TWE24043BAAP01H" Cantidad="2" ValorUnitario="5716.40" Descripcion="Manejadora Trane 20TR R410 230/3/60 Series: ${SERIES_1[0]} ${SERIES_1[1]}"></cfdi:Concepto>
    <cfdi:Concepto NoIdentificacion="TTA24043DAAE02P" Cantidad="2" ValorUnitario="7169.37" Descripcion="Condensadora Trane 20TR R410 230/3/60 Series: ${SERIES_2[0]} ${SERIES_2[1]}"></cfdi:Concepto>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;
const r3 = await executeAgentTool('inv_procesar_factura_trane', {
  xml: xmlTrane,
  oc_ac: '7119',
  fecha_oc: '2026-09-17',
  dry_run: false,
}, nameCtx);
console.log('    Result:', JSON.stringify(r3).slice(0, 400));
if (r3.ok && r3.matched_updated === 4 && (r3.created_new ?? 0) === 0) pass('factura_trane_match', `4 UPDATE + 0 CREATE (match correcto, no duplica)`);
else fail('factura_trane_match', `Esperado 4 updates 0 creates. Got updated=${r3.matched_updated}, created=${r3.created_new}`);

// Verifico filas con retry (propagación eventual Graph)
const trResult = await verifyWithRetry('factura_trane_series', async () => {
  const histRows3 = await adapter.listHistorico(ctxSandbox);
  const matching3 = histRows3.filter(r => String(r.values.oc ?? '').trim() === 'OC07119');
  const withSerie = matching3.filter(r => String(r.values.serie ?? '').trim() && String(r.values.serie ?? '').trim() !== '-');
  return { ok: withSerie.length === 4, count: withSerie.length };
});
console.log(`    Filas con OC07119 + serie real: ${trResult.count} (debería ser 4)`);
if (trResult.ok) pass('factura_trane_series', '4 filas con SERIE llenada');
else fail('factura_trane_series', `${trResult.count}/4 filas con serie`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 4 — inv_registrar_tc_factura
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 4: inv_registrar_tc_factura (TC=18.50) ──');
const r4 = await executeAgentTool('inv_registrar_tc_factura', {
  fact_trane: '80099999',
  tc: 18.50,
}, nameCtx);
console.log('    Result:', JSON.stringify(r4).slice(0, 300));
if (r4.ok && r4.updated_rows === 4) pass('tc_factura', `TC 18.50 aplicado a ${r4.updated_rows} filas, total COSTO MX ${r4.costo_mx_total}`);
else fail('tc_factura', `Esperado 4 updates, got: ${JSON.stringify(r4)}`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 5 — inv_actualizar_estatus a ALMACEN
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 5: inv_actualizar_estatus serie1 → ALMACEN ──');
const r5 = await executeAgentTool('inv_actualizar_estatus', {
  serie: SERIES_1[0],
  nuevo_estatus: 'ALMACEN',
}, nameCtx);
console.log('    Result:', JSON.stringify(r5).slice(0, 300));
if (r5.ok && r5.estatus_nuevo === 'ALMACEN') pass('estatus_almacen', `${r5.estatus_anterior} → ALMACEN. Extra: ${JSON.stringify(r5.extra_patched)}`);
else fail('estatus_almacen', `Got: ${JSON.stringify(r5)}`);

// Verifico RECIBO2=1 y SALIDA=1 con retry
const r5v = await verifyWithRetry('estatus_sideEffects', async () => {
  const hr5 = await adapter.listHistorico(ctxSandbox);
  const row = hr5.find(r => String(r.values.serie ?? '').trim() === SERIES_1[0]);
  if (!row) return { ok: false, recibo2: 'row_not_found', salida: 'row_not_found' };
  return { ok: Number(row.values.recibo2) === 1 && Number(row.values.salida) === 1, recibo2: row.values.recibo2, salida: row.values.salida };
});
console.log(`    serie ${SERIES_1[0]}: RECIBO2=${r5v.recibo2}, SALIDA=${r5v.salida}`);
if (r5v.ok) pass('estatus_sideEffects', 'RECIBO2=1 + SALIDA=1 OK');
else fail('estatus_sideEffects', `RECIBO2=${r5v.recibo2}, SALIDA=${r5v.salida} (ambos deberían ser 1)`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 6 — inv_asignar_cliente
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 6: inv_asignar_cliente serie1 → "Cliente E2E Test" ──');
const r6 = await executeAgentTool('inv_asignar_cliente', {
  serie: SERIES_1[0],
  cliente_nombre: 'Cliente E2E Test',
  vendedor_codigo: 'TST',
  marcar_separado: true,
  force: true,  // porque es '-' default no vacío
}, nameCtx);
console.log('    Result:', JSON.stringify(r6).slice(0, 300));
if (r6.ok && r6.cliente_asignado === 'Cliente E2E Test') pass('asignar_cliente', `${r6.estatus_resultante} + cliente OK`);
else fail('asignar_cliente', `Got: ${JSON.stringify(r6)}`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 7 — inv_registrar_salida
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 7: inv_registrar_salida serie1 → hoja HOJA-E2E-001 ──');
const r7 = await executeAgentTool('inv_registrar_salida', {
  series: [SERIES_1[0]],
  folio_hoja: 'HOJA-E2E-001',
  cliente_nombre: 'Cliente E2E Test',
  vendedor_codigo: 'TST',
  fecha: '2026-09-25',
}, nameCtx);
console.log('    Result:', JSON.stringify(r7).slice(0, 300));
if (r7.ok && r7.series_registradas?.includes(SERIES_1[0])) pass('registrar_salida', `side_effects=${r7.side_effects_applied}`);
else fail('registrar_salida', `Got: ${JSON.stringify(r7)}`);

// Verifico CONTROL=1 y SALIDA=0 con retry
const r7v = await verifyWithRetry('salida_sideEffects', async () => {
  const hr7 = await adapter.listHistorico(ctxSandbox);
  const row = hr7.find(r => String(r.values.serie ?? '').trim() === SERIES_1[0]);
  if (!row) return { ok: false, control: 'row_not_found', salida: 'row_not_found' };
  return { ok: Number(row.values.control) === 1 && Number(row.values.salida) === 0, control: row.values.control, salida: row.values.salida };
});
console.log(`    serie ${SERIES_1[0]}: CONTROL=${r7v.control}, SALIDA=${r7v.salida}`);
if (r7v.ok) pass('salida_sideEffects', 'CONTROL=1 + SALIDA=0 OK');
else fail('salida_sideEffects', `CONTROL=${r7v.control}, SALIDA=${r7v.salida}`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 8 — inv_procesar_factura_venta_sf
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 8: inv_procesar_factura_venta_sf (venta serie1) ──');
const xmlSf = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-09-25T11:00:00" Folio="99999" Serie="A">
  <cfdi:Emisor Rfc="AAP010601S21" Nombre="AC Proyectos"/>
  <cfdi:Receptor Rfc="CLIE010101XX1" Nombre="Cliente E2E Test"/>
  <cfdi:Conceptos>
    <cfdi:Concepto NoIdentificacion="TWE24043BAAP01H" Cantidad="1" ValorUnitario="8205.00" Descripcion="Venta serie ${SERIES_1[0]}"></cfdi:Concepto>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;
const r8 = await executeAgentTool('inv_procesar_factura_venta_sf', {
  xml: xmlSf,
}, nameCtx);
console.log('    Result:', JSON.stringify(r8).slice(0, 400));
if (r8.ok && r8.aplicados >= 1 && r8.factura === 'F-99999A') pass('venta_sf', `FACTURA=${r8.factura}, aplicados=${r8.aplicados}, cliente=${r8.cliente}`);
else fail('venta_sf', `Got: ${JSON.stringify(r8)}`);

// Verifico FACTURA con retry (propagación)
const r8v = await verifyWithRetry('venta_sf_fields', async () => {
  const hr8 = await adapter.listHistorico(ctxSandbox);
  const row = hr8.find(r => String(r.values.serie ?? '').trim() === SERIES_1[0]);
  if (!row) return { ok: false, factura: 'row_not_found' };
  const factura = String(row.values.factura_venta ?? '').trim();
  return { ok: factura === 'F-99999A', factura, fecha_venta: row.values.fecha_venta, costo_vta: row.values.costo_venta_mx };
});
console.log(`    serie ${SERIES_1[0]} FINAL: factura=${r8v.factura}, fecha_venta=${r8v.fecha_venta}, costo_vta=${r8v.costo_vta}`);
if (r8v.ok) pass('venta_sf_fields', 'FACTURA=F-99999A escrita correctamente');
else fail('venta_sf_fields', `FACTURA=${r8v.factura}`);

// ═══════════════════════════════════════════════════════════════════════════
// PASO 9 — inv_definir_familia_modelo
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 9: inv_definir_familia_modelo (entrenar) ──');
const r9 = await executeAgentTool('inv_definir_familia_modelo', {
  modelo: 'E2E-NEW-MODEL',
  familia: 'FAN COIL',
}, nameCtx);
console.log('    Result:', JSON.stringify(r9).slice(0, 300));
if (r9.ok && r9.familia === 'FAN COIL') pass('definir_familia', `aprendió E2E-NEW-MODEL → FAN COIL`);
else fail('definir_familia', `Got: ${JSON.stringify(r9)}`);

// Verifico catálogo en config
const { data: orgPost } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const catalogo = orgPost.inventory_excel_config.familias_catalogo ?? {};
console.log(`    familias_catalogo:`, JSON.stringify(catalogo));
if (catalogo['E2E-NEW-MODEL'] === 'FAN COIL') pass('catalogo_persistido', 'config.familias_catalogo tiene E2E-NEW-MODEL → FAN COIL');
else fail('catalogo_persistido', `catalogo: ${JSON.stringify(catalogo)}`);

} catch (err) {
  console.error('\n✗ EXCEPCIÓN inesperada:', err.message);
  console.error(err.stack);
  failedSteps++;
} finally {
  console.log('\n── Cleanup: revertir config a Excel REAL ──');
  const { data: orgCurrent } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
  const revertedConfig = {
    ...orgCurrent.inventory_excel_config,
    location: { ...orgCurrent.inventory_excel_config.location, itemId: originalItemId },
    // Dejar catalogo nuevo entrenado si pasó (para tests futuros borrar manual)
  };
  await sb.from('organizations').update({ inventory_excel_config: revertedConfig }).eq('portal_email', PORTAL);
  console.log('  config revertido a Excel REAL');
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTE FINAL
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═════════════════════════════════════════');
console.log('REPORTE E2E FULL FLOW — RUN_TAG:', RUN_TAG);
console.log('═════════════════════════════════════════');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${v.ok ? '✓' : '✗'} ${k}: ${v.msg}`);
}
const total = Object.keys(results).length;
const okCount = Object.values(results).filter(r => r.ok).length;
console.log(`\n${okCount}/${total} verificaciones OK`);
console.log(failedSteps === 0 ? '✓ TODO EL FLOW FUNCIONA END-TO-END' : `✗ ${failedSteps} verificaciones fallaron`);
process.exit(failedSteps === 0 ? 0 : 1);
