/**
 * scripts/mapping-cheatsheet.ts
 *
 * Genera 2 tablas para llenar con Beatriz en la cita:
 *  1. TODOS los bloques con su título y código extraído. Beatriz confirma
 *     el código CONTPAQi de cada bloque donde el parser no lo detectó.
 *  2. TODAS las columnas de producto únicas (nombre + precio típico) y
 *     un espacio para el SKU CONTPAQi que Beatriz dicte.
 *
 * Guarda los outputs en:
 *   scripts/output/beatriz-block-codes.csv
 *   scripts/output/beatriz-product-mapping.csv
 *
 * Uso:
 *   npx tsx scripts/mapping-cheatsheet.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseTortilleriaBatchXlsx } from '../src/lib/billing/parsers/tortilleria-batch';

const FIXTURES = join(__dirname, '..', 'src/lib/billing/parsers/__tests__/fixtures');
const OUT      = join(__dirname, 'output');
mkdirSync(OUT, { recursive: true });

interface BlockRow {
  archivo: string;
  bloque: number;
  titulo: string;
  codigoParser: string | null;
  remisiones: number;
  totalExcel: number | null;
}

interface ProductKey {
  columna: string;
  precioTipico: number;
  visto_en: Set<string>; // "codigo:archivo"
}

const blockRows: BlockRow[] = [];
const productMap = new Map<string, ProductKey>();

function key(columna: string, precio: number): string {
  return `${columna.toUpperCase().trim()}@${precio.toFixed(2)}`;
}

for (const filename of ['varios.xlsx', 'ortiz.xlsx', 'melendez.xlsx']) {
  const buf = readFileSync(join(FIXTURES, filename));
  const result = parseTortilleriaBatchXlsx(buf);

  for (let i = 0; i < result.blocks.length; i++) {
    const b = result.blocks[i];
    blockRows.push({
      archivo:      filename,
      bloque:       i + 1,
      titulo:       b.tituloBloque,
      codigoParser: b.codigoCliente,
      remisiones:   b.remisiones.length,
      totalExcel:   b.totalGeneralExcel,
    });

    for (const p of b.productos) {
      if (p.precioUnit == null || p.cantidadTotal === 0) continue;
      const k = key(p.columnaNombre, p.precioUnit);
      if (!productMap.has(k)) {
        productMap.set(k, {
          columna:      p.columnaNombre.trim(),
          precioTipico: p.precioUnit,
          visto_en:     new Set(),
        });
      }
      productMap.get(k)!.visto_en.add(`${b.codigoCliente ?? b.tituloBloque.slice(0, 30)}:${filename}`);
    }
  }
}

// -- Output CSV 1: bloques + código --------------------------------------------
const blockCsv = [
  'archivo,bloque,titulo,codigo_parser,remisiones,total_excel,codigo_contpaqi_correcto,notas',
  ...blockRows.map(r => [
    r.archivo,
    r.bloque,
    JSON.stringify(r.titulo.replace(/\s+/g, ' ').trim()),
    r.codigoParser ?? '',
    r.remisiones,
    r.totalExcel != null ? r.totalExcel.toFixed(2) : '',
    '',
    '',
  ].join(',')),
].join('\n');
writeFileSync(join(OUT, 'beatriz-block-codes.csv'), blockCsv);

// -- Output CSV 2: productos únicos + mapping SKU ------------------------------
const productRows = Array.from(productMap.values())
  .sort((a, b) => a.columna.localeCompare(b.columna) || a.precioTipico - b.precioTipico);

const productCsv = [
  'columna_excel,precio_tipico,visto_en_bloques,sku_contpaqi,nombre_contpaqi,clave_sat,unidad_sat,notas',
  ...productRows.map(p => [
    JSON.stringify(p.columna),
    p.precioTipico.toFixed(2),
    JSON.stringify(Array.from(p.visto_en).slice(0, 6).join('; ')),
    '',
    '',
    '',
    '',
    '',
  ].join(',')),
].join('\n');
writeFileSync(join(OUT, 'beatriz-product-mapping.csv'), productCsv);

// -- Print resumen -------------------------------------------------------------
console.log('');
console.log('===== RESUMEN PARA CITA CON BEATRIZ =====');
console.log('');
console.log(`Bloques total (3 archivos):        ${blockRows.length}`);
console.log(`Bloques con código detectado:      ${blockRows.filter(r => r.codigoParser).length}`);
console.log(`Bloques SIN código (resolver):     ${blockRows.filter(r => !r.codigoParser).length}`);
console.log(`Productos únicos (columna+precio): ${productMap.size}`);
console.log('');
console.log('Archivos generados:');
console.log(`  ${join(OUT, 'beatriz-block-codes.csv')}`);
console.log(`  ${join(OUT, 'beatriz-product-mapping.csv')}`);
console.log('');
console.log('Abre los CSV en Excel y ve llenando junto con Beatriz. Al terminar,');
console.log('mándamelos de vuelta y los ingiero al mapping guardado del portal.');
