import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTortilleriaBatchXlsx } from '../tortilleria-batch';

const FIXTURES = join(__dirname, 'fixtures');
const loadFixture = (name: string) => readFileSync(join(FIXTURES, name));

describe('parseTortilleriaBatchXlsx — CTES. VARIOS', () => {
  const result = parseTortilleriaBatchXlsx(loadFixture('varios.xlsx'));

  it('parsea al menos 2 bloques (Cardenas + Silla)', () => {
    expect(result.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it('primer bloque es Cardenas con código 045', () => {
    const b = result.blocks[0];
    expect(b.codigoCliente).toBe('045');
    expect(b.tituloBloque).toMatch(/CARDENAS/i);
  });

  it('Cardenas tiene 12 remisiones válidas', () => {
    const cardenas = result.blocks.find(b => b.codigoCliente === '045')!;
    expect(cardenas.remisiones.length).toBe(12);
  });

  it('Cardenas TOTAL GENERAL calculado ≈ 8972.60', () => {
    const cardenas = result.blocks.find(b => b.codigoCliente === '045')!;
    expect(cardenas.totalGeneralExcel).toBeCloseTo(8972.6, 1);
    expect(cardenas.totalGeneralCalculado).toBeCloseTo(8972.6, 1);
  });

  it('Cardenas ESTRELLA 1/2 agrega 326 kg', () => {
    const cardenas = result.blocks.find(b => b.codigoCliente === '045')!;
    const est12 = cardenas.productos.find(p => p.columnaNombre === 'ESTRELLA 1/2');
    expect(est12).toBeDefined();
    expect(est12!.cantidadTotal).toBe(326);
    expect(est12!.precioUnit).toBeCloseTo(22.1, 2);
    expect(est12!.subtotalCalculado).toBeCloseTo(7204.6, 1);
  });

  it('Cardenas RANCHO 1/2 agrega 80 kg', () => {
    const cardenas = result.blocks.find(b => b.codigoCliente === '045')!;
    const r12 = cardenas.productos.find(p => p.columnaNombre === 'RANCHO 1/2');
    expect(r12).toBeDefined();
    expect(r12!.cantidadTotal).toBe(80);
    expect(r12!.subtotalCalculado).toBeCloseTo(1768, 1);
  });

  it('detecta bloque SILLA con código alfanumérico SILLATPROP', () => {
    const silla = result.blocks.find(b => b.codigoCliente === 'SILLATPROP');
    expect(silla).toBeDefined();
    expect(silla!.tituloBloque).toMatch(/SILLA/i);
  });
});

describe('parseTortilleriaBatchXlsx — Ortiz (razones sociales distintas)', () => {
  const result = parseTortilleriaBatchXlsx(loadFixture('ortiz.xlsx'));

  it('parsea 3 bloques (Rosario, Diana, Karina)', () => {
    expect(result.blocks.length).toBe(3);
  });

  it('extrae códigos 593, 594, 595 en orden', () => {
    expect(result.blocks[0].codigoCliente).toBe('593');
    expect(result.blocks[1].codigoCliente).toBe('594');
    expect(result.blocks[2].codigoCliente).toBe('595');
  });

  it('bloque 593 (Rosario) TOTAL GENERAL calculado ≈ 19214', () => {
    const b = result.blocks[0];
    expect(b.totalGeneralExcel).toBeCloseTo(19214, 0);
    expect(b.totalGeneralCalculado).toBeCloseTo(19214, 0);
  });

  it('bloque 594 (Diana) TOTAL GENERAL calculado ≈ 21714', () => {
    const b = result.blocks[1];
    expect(b.totalGeneralExcel).toBeCloseTo(21714, 0);
    expect(b.totalGeneralCalculado).toBeCloseTo(21714, 0);
  });

  it('bloque 595 (Karina) TOTAL GENERAL calculado ≈ 12750', () => {
    const b = result.blocks[2];
    expect(b.totalGeneralExcel).toBeCloseTo(12750, 0);
    expect(b.totalGeneralCalculado).toBeCloseTo(12750, 0);
  });

  it('bloque 593 tiene 13 remisiones (verificable contra Excel)', () => {
    expect(result.blocks[0].remisiones.length).toBe(13);
  });

  it('bloque 594 tiene 16 remisiones', () => {
    expect(result.blocks[1].remisiones.length).toBe(16);
  });

  it('bloque 595 tiene 12 remisiones', () => {
    expect(result.blocks[2].remisiones.length).toBe(12);
  });

  it('bloque 595 tolera header roto (columna con número 4 en vez de "ESTRELLA 1KG")', () => {
    const b = result.blocks[2];
    // Debe haber warning por header numérico y NO tronar.
    expect(b.warnings.some(w => /columna sin nombre de producto/i.test(w))).toBe(true);
  });

  it('todos los bloques tienen razón social capturable en el título', () => {
    expect(result.blocks[0].tituloBloque).toMatch(/ROSARIO/i);
    expect(result.blocks[1].tituloBloque).toMatch(/DIANA/i);
    expect(result.blocks[2].tituloBloque).toMatch(/KARINA/i);
  });
});

describe('parseTortilleriaBatchXlsx — Melendez (sin CTE, mapping por nombre)', () => {
  const result = parseTortilleriaBatchXlsx(loadFixture('melendez.xlsx'));

  it('parsea 8 bloques (HACIENDA, CASA BLANCA, HUINALA, CONCORDIA, RINCON, CIENCIA, ANZURES, UROS)', () => {
    expect(result.blocks.length).toBe(8);
  });

  it('ninguno trae código CTE (todos codigoCliente=null)', () => {
    for (const b of result.blocks) {
      expect(b.codigoCliente).toBeNull();
    }
  });

  it('captura el nombre de la sucursal en tituloBloque', () => {
    const titulos = result.blocks.map(b => b.tituloBloque);
    expect(titulos.some(t => /HACIENDA/i.test(t))).toBe(true);
    expect(titulos.some(t => /CASA BLANCA/i.test(t))).toBe(true);
    expect(titulos.some(t => /HUINALA/i.test(t))).toBe(true);
    expect(titulos.some(t => /CONCORDIA/i.test(t))).toBe(true);
    expect(titulos.some(t => /RINCON/i.test(t))).toBe(true);
    expect(titulos.some(t => /CIENCIA/i.test(t))).toBe(true);
    expect(titulos.some(t => /ANZURES/i.test(t))).toBe(true);
    expect(titulos.some(t => /UROS/i.test(t))).toBe(true);
  });

  it('bloque HACIENDA total ≈ 3699', () => {
    const b = result.blocks.find(x => /HACIENDA/i.test(x.tituloBloque))!;
    expect(b.totalGeneralExcel).toBeCloseTo(3699, 0);
    expect(b.totalGeneralCalculado).toBeCloseTo(3699, 0);
    expect(b.remisiones.length).toBe(2);
  });

  it('bloque CASA BLANCA total ≈ 3834', () => {
    const b = result.blocks.find(x => /CASA BLANCA/i.test(x.tituloBloque))!;
    expect(b.totalGeneralExcel).toBeCloseTo(3834, 0);
    expect(b.totalGeneralCalculado).toBeCloseTo(3834, 0);
    expect(b.remisiones.length).toBe(3);
  });

  it('bloque CONCORDIA es válido pero sin remisiones (vacío)', () => {
    const b = result.blocks.find(x => /CONCORDIA/i.test(x.tituloBloque))!;
    expect(b.remisiones.length).toBe(0);
    expect(b.totalGeneralCalculado).toBe(0);
  });

  it('bloque UROS total ≈ 3232 con 2 remisiones', () => {
    const b = result.blocks.find(x => /UROS/i.test(x.tituloBloque))!;
    expect(b.totalGeneralExcel).toBeCloseTo(3232, 0);
    expect(b.totalGeneralCalculado).toBeCloseTo(3232, 0);
    expect(b.remisiones.length).toBe(2);
  });

  it('tolera columnas sin "Suc" (primer producto empieza en columna 2)', () => {
    const b = result.blocks[0];
    const first = b.productos[0];
    expect(first.columnaIdx).toBe(2); // ESTRELLA 1KG en col 2, no col 3
    expect(first.columnaNombre).toMatch(/ESTRELLA/i);
  });

  it('tolera "TORAL KILOS" (typo por TOTAL KILOS) como fila terminal', () => {
    // Si no se tratara como terminal, el parser lo tomaría como remisión y contaría kilos como precio.
    // Verificamos indirectamente: los totales dan bien.
    const b = result.blocks.find(x => /HACIENDA/i.test(x.tituloBloque))!;
    expect(b.totalGeneralCalculado).toBeCloseTo(3699, 0);
  });
});
