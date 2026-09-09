/**
 * scripts/preview-tortilleria-parser.ts
 *
 * Corre el parser contra los 3 Excels reales y muestra el output en formato
 * legible para Beatriz. Uso durante la cita para validar que la extracción
 * del Excel matchea lo que ella espera facturar.
 *
 * Uso:
 *   npx tsx scripts/preview-tortilleria-parser.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTortilleriaBatchXlsx } from '../src/lib/billing/parsers/tortilleria-batch';

const FIXTURES = join(__dirname, '..', 'src/lib/billing/parsers/__tests__/fixtures');

function printBlock(fileLabel: string, blockIdx: number, block: ReturnType<typeof parseTortilleriaBatchXlsx>['blocks'][number]): void {
  console.log('─'.repeat(80));
  console.log(`${fileLabel} — Bloque ${blockIdx + 1}: ${block.tituloBloque}`);
  console.log(`Código cliente: ${block.codigoCliente ?? '(sin CTE, resolver por nombre)'}`);
  console.log(`Remisiones: ${block.remisiones.length}`);
  console.log('');
  console.log('Productos con cantidad > 0:');
  const activos = block.productos.filter(p => p.cantidadTotal > 0);
  if (activos.length === 0) {
    console.log('  (bloque vacío)');
  } else {
    for (const p of activos) {
      const precio    = p.precioUnit    != null ? `$${p.precioUnit.toFixed(2)}` : '(sin precio)';
      const subtotal  = p.subtotalCalculado != null ? `$${p.subtotalCalculado.toFixed(2)}` : '(?)';
      console.log(`  col ${String(p.columnaIdx).padStart(2)} · ${p.columnaNombre.padEnd(20)} · ${p.cantidadTotal.toString().padStart(6)} kg × ${precio.padStart(8)} = ${subtotal.padStart(10)}`);
    }
    console.log('');
    console.log(`  Total calculado: $${block.totalGeneralCalculado.toFixed(2)}`);
    console.log(`  Total Excel:     ${block.totalGeneralExcel != null ? '$' + block.totalGeneralExcel.toFixed(2) : '(no encontrado)'}`);
    if (block.totalGeneralExcel != null) {
      const diff = Math.abs(block.totalGeneralCalculado - block.totalGeneralExcel);
      console.log(`  Diferencia:      $${diff.toFixed(2)} ${diff < 1 ? 'OK' : 'REVISAR'}`);
    }
  }
  if (block.warnings.length > 0) {
    console.log('');
    console.log('  Warnings:');
    for (const w of block.warnings) console.log(`   - ${w}`);
  }
  console.log('');
}

function preview(filename: string): void {
  const buf = readFileSync(join(FIXTURES, filename));
  const result = parseTortilleriaBatchXlsx(buf);
  console.log('');
  console.log('='.repeat(80));
  console.log(`Archivo: ${filename}`);
  console.log(`Bloques encontrados: ${result.blocks.length}`);
  console.log('='.repeat(80));

  for (let i = 0; i < result.blocks.length; i++) {
    printBlock(filename, i, result.blocks[i]);
  }
}

preview('varios.xlsx');
preview('ortiz.xlsx');
preview('melendez.xlsx');
