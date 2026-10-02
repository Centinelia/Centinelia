// E2E dry-run contra sandbox en OneDrive de Camila.
//
// Qué cubre (secuencia completa de la demo del Meet mañana):
//   1. inv_agregar_equipo         (nueva serie dummy)
//   2. inv_asignar_cliente         (serie real sin cliente)
//   3. inv_actualizar_estatus      (serie real → PENDIENTE)
//   4. inv_registrar_venta         (serie real con COSTO MX > 0)
//   5. inv_registrar_salida        (2 series reales + folio hoja dummy)
//   6. inv_importar_backlog        (sync replace, dry_run=false, 45 líneas)
//   7. Idempotencia backlog         (re-correr → 0 added/updated/deleted)
//
// Qué NO cubre:
//   - inv_procesar_factura_trane   (requiere XML CFDI TRANE real; pedir a Camila)
//
// Riesgo: cero sobre Excel real. Toda escritura va al sandbox (location.itemId
// override). inventory_excel_config NO se modifica.
//
// Pool AC: no se cobra. Invoco adapter helpers directamente (los handlers son
// quienes consumen pool).
//
// Audit log: cada mutation se inserta con metadata.sandbox=true para filtrarla.
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/e2e-sandbox-ac.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') {
  console.error('Requiere ALLOW_PROD_SMOKE=true. Aborting.');
  process.exit(1);
}

const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const STATE_FILE = 'C:/Users/Nazre/centinelia/.ac-sandbox-state.json';
if (!fs.existsSync(STATE_FILE)) {
  console.error('Falta', STATE_FILE, '— corre primero setup-sandbox-ac.mjs');
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = state.portal;
const NAMI   = state.nami_agent_id;

const SAMPLE_PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';
const BACKLOG_PASSWORD_FALLBACK = '595170';

const RUN_TAG = 'e2e-sandbox-' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
console.log('── RUN_TAG:', RUN_TAG);

// ─── 1. Build ctx overrideado al sandbox ─────────────────────────────────────
console.log('\n── Build ctx (sandbox override) ──');
const adapter    = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;
const ctxReal    = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctxReal) { console.error('ctx err:', ctxReal); process.exit(1); }

const ctx = {
  ...ctxReal,
  config: {
    ...ctxReal.config,
    location: {
      scope:  ctxReal.config.location.scope,
      itemId: state.sandbox_excel_item_id,       // override!
    },
  },
};
console.log('  Sandbox itemId:', ctx.config.location.itemId);
console.log('  Real itemId   :', state.real_excel_item_id, '(NO se toca)');

// Password del BACKLOG (de config real, no se override)
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const backlogPassword = org?.inventory_excel_config?.backlog_trane?.pdf_password ?? BACKLOG_PASSWORD_FALLBACK;

// ─── 2. Baseline: leer rows reales del sandbox ───────────────────────────────
console.log('\n── Baseline: leer INVENTARIO del sandbox para elegir series ──');
const historicoRows = await adapter.listHistorico(ctx);
console.log('  Rows en INVENTARIO (sandbox):', historicoRows.length);

const col = ctx.config.columns_historico;
console.log('  Columnas lógicas disponibles:', Object.keys(col).join(', '));

// Elegir series: cada una debe satisfacer una precondición distinta
const sByStatus = {};
for (const r of historicoRows) {
  const estatus = String(r.values.estatus ?? '').trim().toUpperCase();
  sByStatus[estatus] ??= [];
  sByStatus[estatus].push(r);
}
console.log('  Distribución ESTATUS:', Object.fromEntries(Object.entries(sByStatus).map(([k, v]) => [k, v.length])));

function pickFirst(rows, predicate) {
  return rows.find(predicate);
}
const almacenRows = sByStatus['ALMACEN'] ?? [];

// Prefiero serie con cliente vacío (happy path, sin force). Fallback: cualquier ALMACEN con force:true.
let asignarWithForce = false;
let serieAsignar = pickFirst(almacenRows, r => !String(r.values.cliente ?? '').trim());
if (!serieAsignar) {
  asignarWithForce = true;
  serieAsignar = almacenRows[0];
  console.log('  (no hay ALMACEN con cliente vacío → uso force:true para override)');
}
const serieEstatus = pickFirst(almacenRows, r => String(r.values.serie ?? '').trim() !== (serieAsignar?.values.serie ?? ''));
// Venta: config NO mapea costo_mx, siempre paso factor explícito (sin heurística).
const serieVenta = pickFirst(almacenRows, r => {
  const s = String(r.values.serie ?? '').trim();
  return s && s !== (serieAsignar?.values.serie ?? '') && s !== (serieEstatus?.values.serie ?? '');
});
const salidaCandidatos = almacenRows.filter(r => {
  const s = String(r.values.serie ?? '').trim();
  return s && s !== (serieAsignar?.values.serie ?? '') && s !== (serieEstatus?.values.serie ?? '') && s !== (serieVenta?.values.serie ?? '');
}).slice(0, 2);

for (const [name, row] of [
  ['asignar',  serieAsignar],
  ['estatus',  serieEstatus],
  ['venta',    serieVenta],
  ['salida_1', salidaCandidatos[0]],
  ['salida_2', salidaCandidatos[1]],
]) {
  if (!row) { console.error('  ✗ Falta serie para', name); process.exit(1); }
  console.log(`  serie_${name}: ${row.values.serie}  (estatus=${row.values.estatus}, cliente="${row.values.cliente ?? ''}")`);
}

const serieNueva = `TEST-E2E-${Date.now()}`;
console.log('  serie_agregar (dummy nueva):', serieNueva);

// ─── Helper: audit log con metadata.sandbox=true ────────────────────────────
async function auditLog(entry) {
  await adapter.insertMutationLog(sb, {
    ...entry,
    metadata: { sandbox: true, source: 'e2e-smoke-pre-meet', run_tag: RUN_TAG, ...(entry.metadata ?? {}) },
    ops_charged: 0,  // sandbox = sin cobro
  });
}

const results = {};

// ─── 3. inv_agregar_equipo ───────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log('[1/6] inv_agregar_equipo — serie:', serieNueva);
try {
  const r = await adapter.addEquipoRow(ctx, {
    oc:            'E2E-OC-' + Date.now(),
    modelo:        'TEST-MODEL-E2E',
    serie:         serieNueva,
    tonelada:      3,  // → debe asignar bodega FLETEROS automático
    usd:           1500,
    tc:            18.5,
    fecha_compra:  '2026-10-02',
    folio_factura: 'E2E-FACT-TEST',
    fecha_factura: '2026-10-02',
  });
  console.log('  Result:', JSON.stringify(r));
  if (!r.ok) throw new Error('agregar_equipo failed: ' + JSON.stringify(r));
  await auditLog({ portal_email: PORTAL, agent_id: NAMI, tool_name: 'inv_agregar_equipo', serie: r.serie, table_row_index: r.row_index, before_state: null, after_state: r.after_state, patched_columns: Object.keys(r.after_state), success: true, error_code: null });
  results.agregar_equipo = { ok: true, row_index: r.row_index, bodega: r.bodega_asignada };
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.agregar_equipo = { ok: false, error: e.message };
}

// ─── 4. inv_asignar_cliente ──────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log('[2/6] inv_asignar_cliente — serie:', serieAsignar.values.serie);
try {
  const r = await adapter.patchClienteBySerie(ctx, String(serieAsignar.values.serie), {
    cliente_nombre:  'E2E CLIENTE DUMMY',
    vendedor_codigo: 'E2E',
    marcar_separado: true,
    force:           asignarWithForce,
  });
  console.log('  Result:', JSON.stringify(r, null, 2).slice(0, 500));
  if (!r.ok) throw new Error('asignar_cliente failed: ' + JSON.stringify(r));
  await auditLog({ portal_email: PORTAL, agent_id: NAMI, tool_name: 'inv_asignar_cliente', serie: r.serie, table_row_index: r.table_row_index, before_state: r.before_state, after_state: r.after_state, patched_columns: r.patched_columns, success: true, error_code: null });
  results.asignar_cliente = { ok: true, estatus_resultante: r.estatus_resultante, patched: r.patched_columns.length };
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.asignar_cliente = { ok: false, error: e.message };
}

// ─── 5. inv_actualizar_estatus ───────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log('[3/6] inv_actualizar_estatus — serie:', serieEstatus.values.serie, '→ PENDIENTE');
try {
  const r = await adapter.patchEstatusBySerie(ctx, String(serieEstatus.values.serie), 'PENDIENTE');
  console.log('  Result:', JSON.stringify({ ok: r.ok, no_op: r.no_op, estatus_anterior: r.estatus_anterior, estatus_nuevo: r.estatus_nuevo, patched_columns: r.patched_columns }));
  if (!r.ok) throw new Error('actualizar_estatus failed: ' + JSON.stringify(r));
  await auditLog({ portal_email: PORTAL, agent_id: NAMI, tool_name: 'inv_actualizar_estatus', serie: r.serie, table_row_index: r.table_row_index, before_state: r.before_state, after_state: r.after_state, patched_columns: r.patched_columns, success: true, error_code: null });
  results.actualizar_estatus = { ok: true, estatus_anterior: r.estatus_anterior, estatus_nuevo: r.estatus_nuevo };
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.actualizar_estatus = { ok: false, error: e.message };
}

// ─── 6. inv_registrar_venta ──────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log('[4/6] inv_registrar_venta — serie:', serieVenta.values.serie);
try {
  const r = await adapter.patchVentaBySerie(ctx, String(serieVenta.values.serie), {
    folio_venta:         'FV-E2E-' + Date.now(),
    fecha_venta:         '2026-10-02',
    factura_venta:       'FAC-E2E-TEST',
    precio_unitario_mx:  35000,
    factor:              1.25,  // explícito (config AC no mapea costo_mx)
  });
  console.log('  Result:', JSON.stringify({ ok: r.ok, factor_calculado: r.factor_calculado, patched_columns: r.patched_columns }));
  if (!r.ok) throw new Error('registrar_venta failed: ' + JSON.stringify(r));
  await auditLog({ portal_email: PORTAL, agent_id: NAMI, tool_name: 'inv_registrar_venta', serie: r.serie, table_row_index: r.table_row_index, before_state: r.before_state, after_state: r.after_state, patched_columns: r.patched_columns, success: true, error_code: null, metadata: { factor_calculado: r.factor_calculado } });
  results.registrar_venta = { ok: true, factor: r.factor_calculado };
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.registrar_venta = { ok: false, error: e.message };
}

// ─── 7. inv_registrar_salida ─────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log('[5/6] inv_registrar_salida — series:', salidaCandidatos.map(c => c.values.serie));
try {
  const r = await adapter.patchSalidaBySeries(ctx, salidaCandidatos.map(c => String(c.values.serie)), {
    folio_hoja:      'E2E-HOJA-' + Date.now(),
    cliente_nombre:  'E2E CLIENTE SALIDA',
    vendedor_codigo: 'E2E',
    fecha:           '2026-10-02',
  });
  console.log('  Result:', JSON.stringify({ ok: r.ok, series_registradas: r.series_registradas, series_not_found: r.series_not_found, conflicts: r.conflicts, message: r.message }));
  if (!r.ok) throw new Error('registrar_salida failed: ' + JSON.stringify(r));
  for (const m of r.mutations) {
    await auditLog({ portal_email: PORTAL, agent_id: NAMI, tool_name: 'inv_registrar_salida', serie: m.serie, table_row_index: m.table_row_index, before_state: m.before_state, after_state: m.after_state, patched_columns: m.patched_columns, success: true, error_code: m.conflict ? 'conflict' : null, metadata: { folio_hoja: r.folio_hoja, conflict: m.conflict ?? null } });
  }
  results.registrar_salida = { ok: true, registradas: r.series_registradas.length, conflicts: r.conflicts.length };
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.registrar_salida = { ok: false, error: e.message };
}

// ─── 8. inv_importar_backlog (replace, dry_run=false) ────────────────────────
console.log('\n──────────────────────────────────────────');
console.log('[6/6] inv_importar_backlog — replace, apply');
try {
  const parser = await import('../src/lib/inventory/backlog-parser.ts');
  const syncer = await import('../src/lib/inventory/backlog-syncer.ts');
  const pdfBytes = new Uint8Array(fs.readFileSync(SAMPLE_PDF));
  const parsed = await parser.parseBacklogPdf(pdfBytes, backlogPassword);
  console.log('  PDF parsed: páginas=', parsed.page_count, ' filas=', parsed.rows.length);

  const sheetCfg = ctx.config.sheets.backlog;
  const summary = await syncer.syncBacklogRows(ctx, sheetCfg, parsed.rows, { dryRun: false, mode: 'replace' });
  console.log('  Summary:', JSON.stringify(summary));

  await auditLog({ portal_email: PORTAL, agent_id: NAMI, tool_name: 'inv_importar_backlog', serie: null, table_row_index: null, before_state: null, after_state: { summary }, patched_columns: ['BACKLOG_SHEET'], success: true, error_code: null, metadata: { mode: 'replace', dry_run: false, pdf_name: state.sandbox_backlog_pdf_name } });
  results.importar_backlog = { ok: true, ...summary };

  // Idempotencia
  console.log('\n  Re-correr para idempotencia (mismos datos, replace)…');
  const summary2 = await syncer.syncBacklogRows(ctx, sheetCfg, parsed.rows, { dryRun: false, mode: 'replace' });
  console.log('  Summary 2nd run:', JSON.stringify(summary2));
  const idempotent = summary2.added === 0 && summary2.updated === 0 && summary2.deleted === 0;
  console.log('  Idempotent:', idempotent ? '✓ YES' : '✗ NO (added=' + summary2.added + ', updated=' + summary2.updated + ', deleted=' + summary2.deleted + ')');
  results.backlog_idempotency = { ok: idempotent, summary2 };
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.importar_backlog = { ok: false, error: e.message };
}

// ─── Reporte final ──────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════');
console.log('REPORTE E2E — RUN_TAG:', RUN_TAG);
console.log('═════════════════════════════════════════');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${v.ok ? '✓' : '✗'} ${k}:`, JSON.stringify(v));
}
const allOk = Object.values(results).every(r => r.ok);
console.log(allOk ? '\n✓ TODOS LOS FLOWS OK — Excel real intacto, sandbox tiene evidencia visual.' : '\n✗ Hay fallos. Revisa el detalle arriba.');
console.log('\nAudit log sandbox query:');
console.log('  SELECT * FROM inventory_mutations_log WHERE metadata->>\'run_tag\' = \'' + RUN_TAG + '\' ORDER BY created_at;');
process.exit(allOk ? 0 : 1);
