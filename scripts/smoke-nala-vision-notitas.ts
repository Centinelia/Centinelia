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
import { extractRemisionesFromImage, type VisionContext } from '@/lib/billing/vision/extract';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = 'fixtures/piloto-tortilleria/notitas-reales';

// Catálogo mock basado en ground truth de las 4 fotos + catálogo canónico
// preimpreso en las notitas. En prod esto lo genera buildVisionContextFromAdapter
// leyendo los CSVs del Dropbox del cliente.
const MOCK_CONTEXT: VisionContext = {
  emisor: {
    nombre: 'TORTILLERÍA ESTRELLA (RAMON OMAR LEAL GUTIERREZ)',
    rfc:    'LEGR700101ABC', // placeholder — el real lo tiene Beatriz
  },
  clientes: [
    // Cantidad hipotética de clientes reales de Beatriz según los ground truths
    // que pudimos identificar. En prod son ~50-80 clientes reales.
    { rfc: 'CAX010101AB1', nombre: 'CANTIL XOCHITL' },
    { rfc: 'OLI010101AB2', nombre: 'OLIVIA SABINAS' },
    { rfc: 'CVA010101AB3', nombre: 'JORGE CABALLERO VALLEJO' },
    { rfc: 'OMN010101AB4', nombre: 'OSCAR MEDINA' },
    { rfc: 'BAL010101AB5', nombre: 'BALLAS SUPERSTORE' },
    { rfc: 'CAS010101AB6', nombre: 'JUAN CASTILLO' },
    // Distractor: clientes que NO están en las fotos, para verificar que el
    // LLM no matchee aleatoriamente.
    { rfc: 'GAR010101AB7', nombre: 'GARCÍA DISTRIBUIDORA' },
    { rfc: 'PAN010101AB8', nombre: 'PANADERÍA LA GLORIA' },
    { rfc: 'ABT010101AB9', nombre: 'ABARROTES LA ESQUINA' },
    { rfc: 'MAR010101AC0', nombre: 'MARTÍNEZ FRUTERIA' },
  ],
  productos: [
    // Catálogo preimpreso exacto en las notitas de Beatriz.
    { sku: 'TOR-MAI-1KG',   nombre: 'PAQ TORTILLA MAIZ 1 KG',            precio_unitario: 27.00 },
    { sku: 'TOR-HAR-TACO',  nombre: 'PAQ TORTILLA HARINA TACO 1 KG',     precio_unitario: 27.00 },
    { sku: 'TOR-500',       nombre: 'PAQ TORTILLA 500 GMS',              precio_unitario: 22.00 },
    { sku: 'TOR-ROJA',      nombre: 'PAQ TORTILLA ROJA',                 precio_unitario: 22.00 },
    { sku: 'SAL-500',       nombre: 'SALSA 500 GMS',                     precio_unitario: 15.00 },
    { sku: 'FRJ-500',       nombre: 'FRIJOL COCIDO 500 GMS',             precio_unitario: 22.00 },
    { sku: 'EST-30-COMUN',  nombre: 'PAQ 30 PZ ESTRELLADAS COMUN',       precio_unitario: 12.00 },
    { sku: 'EST-30-PACK',   nombre: 'PAQ 30 PZ ESTRELLADAS EL PACK',     precio_unitario: 23.00 },
    { sku: 'EST-30-SIN',    nombre: 'PAQ 30 PZ SIN MARCA',               precio_unitario: 12.00 },
    { sku: 'EXT-DEL',       nombre: 'PAQ EXTRA SUPER DELGADITA',         precio_unitario: 27.00 },
    { sku: 'EXT-REG',       nombre: 'PAQ EXTRA REGALO GALLETA',          precio_unitario: 27.00 },
  ],
};

async function main(): Promise<void> {
  const files = readdirSync(FIXTURES_DIR)
    .filter(f => f.toLowerCase().endsWith('.jpeg') || f.toLowerCase().endsWith('.jpg'))
    .sort();

  if (files.length === 0) {
    console.error(`No JPEG files in ${FIXTURES_DIR}`);
    process.exit(2);
  }

  console.log(`Corriendo Nala vision v3 (con VisionContext) contra ${files.length} archivos:`);
  console.log(`  catálogo: ${MOCK_CONTEXT.clientes.length} clientes, ${MOCK_CONTEXT.productos.length} productos\n`);

  for (const file of files) {
    const path = join(FIXTURES_DIR, file);
    const buf  = readFileSync(path);
    console.log(`\n=========== ${file} (${(buf.length / 1024).toFixed(0)} KB) ===========`);
    try {
      const t0 = Date.now();
      const set = await extractRemisionesFromImage(buf, 'image/jpeg', MOCK_CONTEXT);
      const dt = Date.now() - t0;
      console.log(`  ⏱  ${dt}ms  |  remisiones: ${set.remisiones.length}  |  conf_global: ${set.confianza_global}`);
      set.remisiones.forEach((r, i) => {
        const withQty = r.productos.filter(p => p.cantidad !== null && p.cantidad > 0);
        console.log(`  --- remisión #${i + 1}: folio=${r.folio_remision ?? '(null)'} ---`);
        console.log(`      cliente:      "${r.cliente_texto ?? '(null)'}"  →  RFC: ${r.cliente_matched_rfc ?? '(no match)'}`);
        console.log(`      fecha:        ${r.fecha ?? '(null)'}`);
        console.log(`      total:        ${r.monto_total ?? '(null)'}  |  aritmética delta: ${r.aritmetica_delta ?? '(null)'}`);
        console.log(`      productos con cantidad (${withQty.length}/${r.productos.length}):`);
        for (const p of withQty) {
          const sku = p.sku_matched ? ` [SKU: ${p.sku_matched}]` : ' [sin match]';
          console.log(`        · ${p.cantidad} ${p.unidad ?? ''} × ${p.nombre} @ $${p.precio_unitario ?? '?'}${sku}`);
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
