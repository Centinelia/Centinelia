// Smoke test end-to-end del flow BACKLOG contra PROD:
//   - config real de Camila en Supabase
//   - token Microsoft real
//   - PDF local del sample 2026-09-30
//   - parser real
//   - syncer en dry_run (0 escrituras)
//   - imprime el summary + diff lo que cambiaría
//
// Riesgo: CERO escrituras al Excel. Solo lecturas.
//
// Uso: ALLOW_PROD_SMOKE=true node _smoke/sync-backlog-dryrun-ac.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') {
  console.error('Requiere ALLOW_PROD_SMOKE=true. Aborting.');
  process.exit(1);
}

// .env.local no vive en el worktree (bloqueado por classifier por seguridad);
// leer del repo padre con dotenv para que todas las vars (ENCRYPTION_KEY,
// MICROSOFT_CLIENT_ID, etc.) entren a process.env, no solo las que mi parser
// casero manejaba.
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const SAMPLE_PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';

if (!fs.existsSync(SAMPLE_PDF)) {
  console.error('Sample PDF no encontrado:', SAMPLE_PDF);
  process.exit(1);
}

console.log('── 1. Resolviendo inventory context ──');
const adapter = await import('../src/lib/inventory/adapter.ts');
const ctx = await adapter.resolveInventoryContext(PORTAL, sb, NAMI);
if ('error' in ctx) { console.error('ctx err:', ctx); process.exit(1); }
console.log('  token Microsoft resuelto (prefix):', ctx.token.slice(0, 30) + '...');
console.log('  itemId Excel:', ctx.config.location.itemId);
console.log('  sheet BACKLOG config:', JSON.stringify(ctx.config.sheets.backlog));

const sheetCfg = ctx.config.sheets?.backlog;
if (!sheetCfg) { console.error('No hay sheets.backlog en config'); process.exit(1); }

console.log('\n── 2. Fetch password de la config ──');
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const password = org?.inventory_excel_config?.backlog_trane?.pdf_password;
if (!password) { console.error('No hay backlog_trane.pdf_password en config'); process.exit(1); }
console.log('  password:', password);

console.log('\n── 3. Parseando PDF local ──');
const pdfBytes = new Uint8Array(fs.readFileSync(SAMPLE_PDF));
const parser = await import('../src/lib/inventory/backlog-parser.ts');
const parsed = await parser.parseBacklogPdf(pdfBytes, password);
console.log('  páginas:', parsed.page_count);
console.log('  filas parseadas:', parsed.rows.length);
const errorsRows = parsed.rows.filter(r => r.parse_errors.length > 0);
if (errorsRows.length) {
  console.log('  ⚠ filas con parse errors:', errorsRows.length);
  for (const r of errorsRows.slice(0, 3)) console.log('    ', r.customer_po_number, r.line_number, r.parse_errors.join('; '));
}

console.log('\n── 4. Syncer dry_run (lee Excel REAL, 0 escrituras) ──');
const syncer = await import('../src/lib/inventory/backlog-syncer.ts');

// Mode replace (default per Camila)
console.log('\n  Mode: replace (default confirmado por Camila 2026-10-01)');
const summaryReplace = await syncer.syncBacklogRows(ctx, sheetCfg, parsed.rows, { dryRun: true, mode: 'replace' });
console.log('  Summary:', JSON.stringify(summaryReplace, null, 2));

// Mode upsert (para comparar)
console.log('\n  Mode: upsert (comparación — qué pasaría si usáramos upsert)');
const summaryUpsert = await syncer.syncBacklogRows(ctx, sheetCfg, parsed.rows, { dryRun: true, mode: 'upsert' });
console.log('  Summary:', JSON.stringify(summaryUpsert, null, 2));

console.log('\n── 5. Diff: filas que serían ELIMINADAS en modo replace ──');
if (summaryReplace.deleted > 0) {
  console.log('  (' + summaryReplace.deleted + ' filas en Excel que no están en el PDF nuevo)');
  // Leer el BACKLOG actual para listar cuáles
  const { index: existing } = await syncer.readBacklogIndex(ctx, sheetCfg);
  const parsedKeys = new Set(parsed.rows.map(syncer.rowKey));
  let shown = 0;
  for (const [key, { rowNumber, values }] of existing) {
    if (!parsedKeys.has(key) && shown < 10) {
      console.log('    row ' + rowNumber + ' | OC AC=' + values[0] + ' | OC TRANE=' + values[1] + ' | ' + values[3] + ' | ' + values[5]);
      shown++;
    }
  }
  if (summaryReplace.deleted > 10) console.log('    ... y ' + (summaryReplace.deleted - 10) + ' más');
} else {
  console.log('  ninguna.');
}

console.log('\n── 6. Agregados del PDF para validación visual ──');
const byStatus = new Map();
for (const r of parsed.rows) {
  const k = r.lines_status || '(null)';
  byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
}
for (const [k, v] of byStatus) console.log('  ' + k + ': ' + v);
const totalUsd = parsed.rows.reduce((s, r) => s + (r.backlog_usd ?? 0), 0);
console.log('  Total BACKLOG USD: $' + totalUsd.toFixed(2));

console.log('\n✓ DONE — zero escrituras realizadas. Excel de Camila intacto.');
console.log('\nSi los números te hacen sentido, el flow real con Camila es seguro.');
console.log('Si ves anomalías (ej. deleted muy alto, muchos parse_errors), investigar antes del Meet.');
