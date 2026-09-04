/**
 * scripts/smoke-nala-vision-notitas.ts
 *
 * Corre extractNoteFromImage (mismo pipeline que Nala usa en prod) contra
 * cada JPEG en fixtures/piloto-tortilleria/notitas-reales/ e imprime el
 * output estructurado + scores de confianza.
 *
 * Objetivo: validar el eslabón vision → matching antes de instalar en
 * Beatriz, ya que era el único que no habíamos probado E2E con notitas
 * reales (el resto del pipeline sí, contra XMLs sintéticos).
 *
 * Uso:
 *   npx tsx scripts/smoke-nala-vision-notitas.ts
 *
 * Requiere: ANTHROPIC_API_KEY en env.
 */
import { extractRemisionesFromImage } from '@/lib/billing/vision/extract';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = 'fixtures/piloto-tortilleria/notitas-reales';

async function main(): Promise<void> {
  const files = readdirSync(FIXTURES_DIR)
    .filter(f => f.toLowerCase().endsWith('.jpeg') || f.toLowerCase().endsWith('.jpg'))
    .sort();

  if (files.length === 0) {
    console.error(`No JPEG files in ${FIXTURES_DIR}`);
    process.exit(2);
  }

  console.log(`Corriendo Nala vision v2 (multi-remisión) contra ${files.length} archivos:\n`);

  for (const file of files) {
    const path = join(FIXTURES_DIR, file);
    const buf  = readFileSync(path);
    console.log(`\n=========== ${file} (${(buf.length / 1024).toFixed(0)} KB) ===========`);
    try {
      const t0 = Date.now();
      const set = await extractRemisionesFromImage(buf, 'image/jpeg');
      const dt = Date.now() - t0;
      console.log(`  ⏱  ${dt}ms  |  remisiones: ${set.remisiones.length}  |  conf_global: ${set.confianza_global}`);
      set.remisiones.forEach((r, i) => {
        const withQty = r.productos.filter(p => p.cantidad !== null && p.cantidad > 0);
        console.log(`  --- remisión #${i + 1}: folio=${r.folio_remision ?? '(null)'} ---`);
        console.log(`      cliente:      ${r.cliente_texto ?? '(null)'}`);
        console.log(`      fecha:        ${r.fecha ?? '(null)'}`);
        console.log(`      total:        ${r.monto_total ?? '(null)'}`);
        console.log(`      productos con cantidad (${withQty.length}/${r.productos.length}):`);
        for (const p of withQty) {
          console.log(`        · ${p.cantidad} ${p.unidad ?? ''} × ${p.nombre} @ $${p.precio_unitario ?? '?'}`);
        }
        console.log(`      confianza:    ${JSON.stringify(r.confianza)}`);
      });
      if (set.notas_raw_all) {
        console.log(`  notas_raw_all: ${set.notas_raw_all.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`  ❌ error:`, err instanceof Error ? err.message : String(err));
    }
  }
}

main().catch(err => {
  console.error('smoke failed:', err);
  process.exit(1);
});
