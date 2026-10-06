// E2E smoke del flow BACKLOG completo en SANDBOX. Verifica:
//   1. Parse del PDF real de Camila (sin tocar Excel)
//   2. Syncer dry_run contra sandbox (0 writes, calcula diffs)
//   3. Syncer apply mode=replace → escribe filas al sandbox BACKLOG
//   4. Re-sync inmediato → idempotency (0 added, 0 updated, 0 deleted)
//   5. REAL intacto (safety check)
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/e2e-backlog-nami.mjs
// Riesgo: cero sobre Excel real (ctx override itemId sandbox).

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const STATE_FILE = 'C:/Users/Nazre/centinelia/.ac-sandbox-state.json';
const SAMPLE_PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';
if (!fs.existsSync(STATE_FILE)) { console.error('Falta state file. Corre setup-sandbox-ac.mjs primero.'); process.exit(1); }
if (!fs.existsSync(SAMPLE_PDF)) { console.error('Falta PDF sample:', SAMPLE_PDF); process.exit(1); }

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = state.portal;
const NAMI = state.nami_agent_id;
const RUN_TAG = 'backlog-e2e-' + Date.now();
console.log('── RUN_TAG:', RUN_TAG, '─────────────────\n');

const adapter = await import('../src/lib/inventory/adapter.ts');
const GraphExcel = adapter.GraphExcel;
const parser = await import('../src/lib/inventory/backlog-parser.ts');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');

const results = {};
let failedSteps = 0;
function pass(step, msg) { console.log(`  ✓ ${step}: ${msg}`); results[step] = { ok: true, msg }; }
function fail(step, msg) { console.log(`  ✗ ${step}: ${msg}`); results[step] = { ok: false, msg }; failedSteps++; }

// Setup: redirigir DB config → sandbox
console.log('── Setup: DB config → sandbox ──');
const { data: orgPre } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const originalItemId = orgPre.inventory_excel_config.location.itemId;
await sb.from('organizations').update({
  inventory_excel_config: { ...orgPre.inventory_excel_config, location: { ...orgPre.inventory_excel_config.location, itemId: state.sandbox_excel_item_id } },
}).eq('portal_email', PORTAL);
console.log('  itemId: real', originalItemId.slice(0, 20) + '...', '→ sandbox', state.sandbox_excel_item_id.slice(0, 20) + '...');

try {

// ═════════════════════════════════════════════════════════════════════════
// PASO 1 — Parse del PDF real
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 1: parse PDF Camila ──');
const ctxSandbox = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctxSandbox) throw new Error('ctx: ' + ctxSandbox.error);
const sheetCfg = ctxSandbox.config.sheets?.backlog;
if (!sheetCfg) throw new Error('No sheets.backlog en config');
const password = ctxSandbox.config.backlog_trane?.pdf_password;
if (!password) throw new Error('No pdf_password en config');

const pdfBytes = new Uint8Array(fs.readFileSync(SAMPLE_PDF));
const parsed = await parser.parseBacklogPdf(pdfBytes, password);
console.log(`    páginas: ${parsed.page_count}, filas parseadas: ${parsed.rows.length}, errors: ${parsed.rows.filter(r => r.parse_errors.length).length}`);
if (parsed.rows.length > 10 && parsed.rows.filter(r => r.parse_errors.length).length === 0) {
  pass('parse_pdf', `${parsed.rows.length} filas sin parse errors`);
} else {
  fail('parse_pdf', `${parsed.rows.length} filas, ${parsed.rows.filter(r => r.parse_errors.length).length} con errors`);
}

// ═════════════════════════════════════════════════════════════════════════
// PASO 2 — Estado inicial sandbox BACKLOG (snapshot pre-sync)
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 2: snapshot inicial sandbox BACKLOG ──');
const { index: preIndex } = await syncer.readBacklogIndex(ctxSandbox, sheetCfg);
console.log(`    filas BACKLOG en sandbox (pre-sync): ${preIndex.size}`);
pass('snapshot_initial', `${preIndex.size} filas iniciales en sandbox`);

// ═════════════════════════════════════════════════════════════════════════
// PASO 3 — Dry run (0 writes esperados)
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 3: syncer dry_run mode=replace ──');
const dryResult = await syncer.syncBacklogRows(ctxSandbox, sheetCfg, parsed.rows, { dryRun: true, mode: 'replace' });
console.log(`    summary: parsed=${dryResult.total_parsed}, added=${dryResult.added}, updated=${dryResult.updated}, unchanged=${dryResult.unchanged}, deleted=${dryResult.deleted}`);
if (dryResult.total_parsed === parsed.rows.length && dryResult.errors.length === 0) {
  pass('dry_run', `dry_run reporta ${dryResult.total_parsed} parsed, 0 errors`);
} else {
  fail('dry_run', `errors: ${JSON.stringify(dryResult.errors)}`);
}

// Verifico que dry_run NO escribió
await new Promise(r => setTimeout(r, 3000));
const { index: postDryIndex } = await syncer.readBacklogIndex(ctxSandbox, sheetCfg);
if (postDryIndex.size === preIndex.size) {
  pass('dry_run_safety', `dry_run no escribió (filas: ${postDryIndex.size})`);
} else {
  fail('dry_run_safety', `dry_run modificó: ${preIndex.size} → ${postDryIndex.size}`);
}

// ═════════════════════════════════════════════════════════════════════════
// PASO 4 — Apply mode=replace
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 4: syncer APPLY mode=replace ──');
const applyResult = await syncer.syncBacklogRows(ctxSandbox, sheetCfg, parsed.rows, { dryRun: false, mode: 'replace' });
console.log(`    summary: parsed=${applyResult.total_parsed}, added=${applyResult.added}, updated=${applyResult.updated}, unchanged=${applyResult.unchanged}, deleted=${applyResult.deleted}, errors=${applyResult.errors.length}`);
if (applyResult.errors.length === 0) {
  pass('apply_replace', `${applyResult.added} added + ${applyResult.updated} updated + ${applyResult.unchanged} unchanged + ${applyResult.deleted} deleted`);
} else {
  fail('apply_replace', `${applyResult.errors.length} errores: ${JSON.stringify(applyResult.errors.slice(0, 3))}`);
}

// Verifico filas presentes en sandbox tras apply
await new Promise(r => setTimeout(r, 4000));
const { index: postApplyIndex } = await syncer.readBacklogIndex(ctxSandbox, sheetCfg);
console.log(`    filas BACKLOG en sandbox (post-apply): ${postApplyIndex.size}`);
if (postApplyIndex.size === parsed.rows.length) {
  pass('apply_count', `${postApplyIndex.size} filas en sandbox = ${parsed.rows.length} parseadas (match exacto)`);
} else {
  fail('apply_count', `${postApplyIndex.size} filas en sandbox vs ${parsed.rows.length} parseadas`);
}

// Spot check: contenido de la primera fila
const firstParsedKey = syncer.rowKey(parsed.rows[0]);
const firstInSandbox = postApplyIndex.get(firstParsedKey);
if (firstInSandbox) {
  console.log(`    primera fila (${firstParsedKey}): row ${firstInSandbox.rowNumber}, OC AC=${firstInSandbox.values[0]}, OC TRANE=${firstInSandbox.values[1]}, modelo=${firstInSandbox.values[3]}`);
  pass('apply_first_row', `fila 1 presente en sandbox`);
} else {
  fail('apply_first_row', `fila 1 parseada no está en sandbox`);
}

// ═════════════════════════════════════════════════════════════════════════
// PASO 5 — Idempotency: re-sync inmediato debe ser 0-change
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 5: idempotency (re-sync con mismos datos) ──');
const idempResult = await syncer.syncBacklogRows(ctxSandbox, sheetCfg, parsed.rows, { dryRun: false, mode: 'replace' });
console.log(`    summary: added=${idempResult.added}, updated=${idempResult.updated}, unchanged=${idempResult.unchanged}, deleted=${idempResult.deleted}`);
if (idempResult.added === 0 && idempResult.updated === 0 && idempResult.deleted === 0 && idempResult.unchanged === parsed.rows.length) {
  pass('idempotent', `0 added, 0 updated, 0 deleted, ${idempResult.unchanged} unchanged. Perfecto.`);
} else {
  fail('idempotent', `added=${idempResult.added}, updated=${idempResult.updated}, deleted=${idempResult.deleted}, unchanged=${idempResult.unchanged}`);
}

// ═════════════════════════════════════════════════════════════════════════
// PASO 6 — Upsert NO borra: subset en modo upsert preserva fila extra
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 6a: upsert con subset (nuevo default — NO borra silenciosamente) ──');
const subsetRows = parsed.rows.slice(0, -1);  // todas menos la última
const upsertResult = await syncer.syncBacklogRows(ctxSandbox, sheetCfg, subsetRows, { dryRun: false, mode: 'upsert' });
console.log(`    summary (subset ${subsetRows.length}, mode=upsert): added=${upsertResult.added}, updated=${upsertResult.updated}, unchanged=${upsertResult.unchanged}, deleted=${upsertResult.deleted}`);
if (upsertResult.deleted === 0 && upsertResult.unchanged === subsetRows.length) {
  pass('upsert_no_delete', `upsert no borró nada (deleted=0) + ${subsetRows.length} unchanged. SAFE DEFAULT.`);
} else {
  fail('upsert_no_delete', `upsert borró ${upsertResult.deleted} filas (esperado 0)`);
}

// Verifico que la fila que NO estaba en el subset SIGUE en el sandbox
await new Promise(r => setTimeout(r, 3000));
const { index: postUpsertIndex } = await syncer.readBacklogIndex(ctxSandbox, sheetCfg);
const droppedKey = syncer.rowKey(parsed.rows[parsed.rows.length - 1]);
if (postUpsertIndex.has(droppedKey) && postUpsertIndex.size === parsed.rows.length) {
  pass('upsert_preserves', `fila "${droppedKey}" sigue en sandbox tras upsert con subset (total ${postUpsertIndex.size})`);
} else {
  fail('upsert_preserves', `postUpsertIndex=${postUpsertIndex.size}, droppedKey presente=${postUpsertIndex.has(droppedKey)}`);
}

// ═════════════════════════════════════════════════════════════════════════
// PASO 6b — Replace SÍ borra cuando se pide explícito
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 6b: replace explícito SÍ borra (comportamiento intencional) ──');
const replaceResult = await syncer.syncBacklogRows(ctxSandbox, sheetCfg, subsetRows, { dryRun: false, mode: 'replace' });
console.log(`    summary (subset ${subsetRows.length}, mode=replace): added=${replaceResult.added}, updated=${replaceResult.updated}, unchanged=${replaceResult.unchanged}, deleted=${replaceResult.deleted}`);
if (replaceResult.deleted === 1 && replaceResult.unchanged === subsetRows.length) {
  pass('replace_still_deletes', `replace borró 1 fila cuando se pidió explícito + ${subsetRows.length} unchanged.`);
} else {
  fail('replace_still_deletes', `deleted=${replaceResult.deleted} (esperado 1)`);
}

// Restore: re-sync con todas las filas
await syncer.syncBacklogRows(ctxSandbox, sheetCfg, parsed.rows, { dryRun: false, mode: 'replace' });

// ═════════════════════════════════════════════════════════════════════════
// PASO 6c — Verificar default del HANDLER es upsert (code assertion)
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 6c: default del handler inv_importar_backlog ──');
const executorSrc = fs.readFileSync('src/lib/tools/executor.ts', 'utf8');
const match = executorSrc.match(/a\.mode === 'replace' \? 'replace' : 'upsert'/);
if (match) {
  pass('handler_default', 'handler default = upsert (code assertion OK)');
} else {
  const backwardsMatch = executorSrc.match(/a\.mode === 'upsert' \? 'upsert' : 'replace'/);
  if (backwardsMatch) fail('handler_default', 'handler aún tiene default=replace — fix no aplicado');
  else fail('handler_default', 'pattern no encontrado — revisar manualmente');
}

} catch (err) {
  console.error('\n✗ EXCEPCIÓN:', err.message);
  console.error(err.stack);
  failedSteps++;
} finally {
  console.log('\n── Cleanup: revertir DB config a REAL ──');
  const { data: orgCurrent } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
  await sb.from('organizations').update({
    inventory_excel_config: { ...orgCurrent.inventory_excel_config, location: { ...orgCurrent.inventory_excel_config.location, itemId: originalItemId } },
  }).eq('portal_email', PORTAL);
  console.log('  config revertido a Excel REAL');
}

// ═════════════════════════════════════════════════════════════════════════
// PASO 7 — REAL safety: 0 contaminación
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── PASO 7: REAL safety check ──');
// Pequeño sleep + retry para Graph propagación cross-session
await new Promise(r => setTimeout(r, 5000));
const ctxReal = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctxReal) {
  fail('real_safety', 'ctx real err: ' + ctxReal.error);
} else {
  // readRange directo para contar filas no-vacías (más robusto que
  // readBacklogIndex que puede filtrar por criterios).
  const range = await GraphExcel.readRange(ctxReal.token, ctxReal.config.location, 'BACKLOG', 'A1:H60');
  let nonEmpty = 0;
  for (const row of range.values) {
    if (row.some(v => v !== '' && v !== null && v !== undefined)) nonEmpty++;
  }
  console.log(`    filas no-vacías en BACKLOG real: ${nonEmpty}`);
  if (nonEmpty > 10) {
    pass('real_safety', `REAL intacto (${nonEmpty} filas no-vacías incluye header)`);
  } else {
    fail('real_safety', `REAL con ${nonEmpty} filas — sospechoso`);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// REPORTE
// ═════════════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════');
console.log('REPORTE E2E BACKLOG — RUN_TAG:', RUN_TAG);
console.log('═══════════════════════════════════════');
for (const [k, v] of Object.entries(results)) console.log(`  ${v.ok ? '✓' : '✗'} ${k}: ${v.msg}`);
const okCount = Object.values(results).filter(r => r.ok).length;
const total = Object.keys(results).length;
console.log(`\n${okCount}/${total} verificaciones OK`);
console.log(failedSteps === 0 ? '✓ BACKLOG FLOW VERDE END-TO-END' : `✗ ${failedSteps} verificaciones fallaron`);
process.exit(failedSteps === 0 ? 0 : 1);
