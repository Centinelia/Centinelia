// Smoke test: parsea el PDF real de BACKLOG TRANE del sample 2026-09-30
// usando parseBacklogPdf (pipeline completo: descifra + extrae + parsea).
//
// Verifica que la primera fila mapea 1:1 al schema documentado en
// [[project-ac-backlog-trane-schema]].
//
// Uso: node _smoke/parse-backlog-dryrun.mjs
// Requiere: PDF sample en la ruta hardcoded abajo (Dropbox del dev).

import fs from 'node:fs';

const SAMPLE_PDF = 'C:/Users/Nazre/Dropbox/PC/Downloads/AC Proyectos X Centinelia/Elementos/Inventarios/AIRE ACONDICIONADO PROYECTOS SA DE CV.pdf';
const PASSWORD   = '595170';

if (!fs.existsSync(SAMPLE_PDF)) {
  console.error('Sample PDF no encontrado:', SAMPLE_PDF);
  process.exit(1);
}

const pdfBytes = new Uint8Array(fs.readFileSync(SAMPLE_PDF));
console.log('PDF cargado, bytes:', pdfBytes.length);

const parser = await import('../src/lib/inventory/backlog-parser.ts');
const result = await parser.parseBacklogPdf(pdfBytes, PASSWORD);

console.log(`\nPáginas: ${result.page_count}`);
console.log(`Filas parseadas: ${result.rows.length}`);
console.log(`Parsed at: ${result.parsed_at}\n`);

console.log('── Primera fila ──');
console.log(JSON.stringify(result.rows[0], null, 2));

if (result.rows.length > 1) {
  console.log('\n── Última fila ──');
  console.log(JSON.stringify(result.rows[result.rows.length - 1], null, 2));
}

const withErrors = result.rows.filter(r => r.parse_errors.length > 0);
if (withErrors.length) {
  console.log(`\n⚠ ${withErrors.length} filas con parse errors:`);
  for (const r of withErrors.slice(0, 5)) {
    console.log(`  OC ${r.customer_po_number} línea ${r.line_number}:`, r.parse_errors.join('; '));
  }
}

// Agregados útiles para validación visual
const byStatus = new Map();
for (const r of result.rows) {
  const k = r.lines_status || '(null)';
  byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
}
console.log('\n── Distribución de LINES STATUS ──');
for (const [k, v] of byStatus) console.log(`  ${k}: ${v}`);

const totalUsd = result.rows.reduce((s, r) => s + (r.backlog_usd ?? 0), 0);
console.log(`\nTotal BACKLOG USD: $${totalUsd.toFixed(2)}`);

console.log('\nDONE.');
