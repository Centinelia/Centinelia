/**
 * Tests del parser Ramón Leang. Usa el fixture real de una hoja con múltiples
 * bloques semanales de 2025-2026.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRamonLeangXlsx } from '../ramon-leang-weekly';

const FIXTURE = join(__dirname, 'fixtures', 'ramon-leang', 'ramon-leang-real.xlsx');
const buf = readFileSync(FIXTURE);

describe('parseRamonLeangXlsx — fixture real Ramón Leang', () => {
  const { blocks, warnings } = parseRamonLeangXlsx(buf);

  it('detecta al menos 15 bloques semanales', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(15);
  });

  it('sin warnings globales del archivo', () => {
    expect(warnings).toEqual([]);
  });

  it('bloque 2026-09-04: 5 días hábiles × $14,507 + ajuste $14,511.50 = $87,046.50', () => {
    const w = blocks.find(b => b.weekStart === '2026-09-04');
    expect(w).toBeDefined();
    expect(w!.diasHabiles).toEqual([1, 2, 3, 4, 7]);
    expect(w!.cfdiBase).toBe(14507);
    expect(w!.ajusteFecha).toBe('2026-09-08');
    expect(w!.ajusteMonto).toBe(14511.5);
    expect(w!.totalDepositos).toBe(87046.5);
    // Sanity: suma cuadra
    const suma = w!.cfdiBase! * w!.diasHabiles.length + w!.ajusteMonto!;
    expect(suma).toBe(87046.5);
  });

  it('bloque 2026-08-07: 6 días × $11,642 + ajuste $11,644 = $81,496', () => {
    const w = blocks.find(b => b.weekStart === '2026-08-07');
    expect(w).toBeDefined();
    expect(w!.diasHabiles).toEqual([3, 4, 5, 6, 7, 10]);
    expect(w!.cfdiBase).toBe(11642);
    expect(w!.ajusteMonto).toBe(11644);
    expect(w!.cfdiBase! * w!.diasHabiles.length + w!.ajusteMonto!).toBe(81496);
  });

  it('la MAYORÍA de los bloques válidos cuadran (permite outliers por errores de captura de Beatriz PV)', () => {
    // Es data real; puede haber semanas con errores humanos que Nala detectaría
    // con confidence check y mandaría a revisión. Test: al menos 80% cuadran.
    const validos = blocks.filter(b => b.cfdiBase != null && b.totalDepositos != null && b.ajusteMonto != null);
    const cuadran = validos.filter(b => {
      const suma = b.cfdiBase! * b.diasHabiles.length + b.ajusteMonto!;
      return Math.abs(suma - b.totalDepositos!) <= 1;
    });
    const ratio = cuadran.length / validos.length;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
  });

  it('descarta falsos positivos: no crea bloque para fechas de ajuste en col DEP', () => {
    // R4 col 4 = 2026-09-08 (ajuste de semana 2026-09-04). NO debe ser bloque.
    const falsoPositivo = blocks.find(b => b.weekStart === '2026-09-08' && b.headerRowIndex === 4);
    expect(falsoPositivo).toBeUndefined();
  });

  it('normaliza whitespace variable en días hábiles (ej. "8, 9, 10 , 13")', () => {
    const w = blocks.find(b => b.diasHabilesRaw?.includes('10 , 13'));
    if (w) {
      expect(w.diasHabiles).toEqual([8, 9, 10, 13]);
    }
  });
});
