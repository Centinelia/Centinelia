/**
 * Tests de confidence.ts (auto-approve para Ramón Leang).
 * Aritmética fixed-point + validación calendárica del ajusteFecha.
 */
import { describe, it, expect } from 'vitest';
import { checkConfidence } from '../confidence';
import type { ParsedWeekBlock } from '../../parsers/ramon-leang-weekly';

const baseBlock = (o: Partial<ParsedWeekBlock> = {}): ParsedWeekBlock => ({
  weekStart:        '2026-09-04',
  totalDepositos:   87046.5,
  cfdiBase:         14507,
  ajusteFecha:      '2026-09-08',
  ajusteMonto:      14511.5,
  diasHabiles:      [1, 2, 3, 4, 7],
  diasHabilesRaw:   '1, 2, 3, 4, 7',
  detalleDepositos: [],
  observaciones:    null,
  headerRowIndex:   0,
  colIndex:         3,
  warnings:         [],
  ...o,
});

describe('checkConfidence — suma cuadra (fixed-point)', () => {
  it('auto-approve cuando suma exacta', () => {
    const r = checkConfidence({ block: baseBlock() });
    expect(r.autoApprove).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('no acumula drift IEEE-754 en multiplicaciones de fracciones', () => {
    // cfdiBase con centavos.7 x 5 = ...5.5 que floating-point vuelve ...5.500000001
    const b = baseBlock({
      cfdiBase:       14507.7,
      diasHabiles:    [1, 2, 3, 4, 5],
      ajusteMonto:    100,
      // 14507.7 × 5 + 100 = 72638.50 + 100 = 72638.50 = 72538.50 (¡a mano!)
      // 14507.7 × 5 = 72538.5 + 100 = 72638.5
      totalDepositos: 72638.5,
    });
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(true);
  });

  it('rechaza con diff real > $1 (verdadero descuadre)', () => {
    const b = baseBlock({ totalDepositos: 87050 }); // $3.5 off
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons[0]).toMatch(/no cuadra/);
  });

  it('acepta diff ≤ $1 (tolerancia de redondeo)', () => {
    const b = baseBlock({ totalDepositos: 87047 }); // $0.5 off
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(true);
  });
});

describe('checkConfidence — ajusteFecha calendárico', () => {
  it('rechaza 2026-02-30 (fecha inexistente)', () => {
    const b = baseBlock({
      weekStart:   '2026-02-24',
      diasHabiles: [24, 25, 26, 27, 28],
      ajusteFecha: '2026-02-30',
      totalDepositos: 14507 * 5 + 14511.5,
    });
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /inválida/i.test(x))).toBe(true);
  });

  it('rechaza ajusteFecha en mes 2+ del weekStart', () => {
    const b = baseBlock({
      weekStart:      '2026-09-04',
      ajusteFecha:    '2026-12-08',
      totalDepositos: 14507 * 5 + 14511.5,
    });
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /mes\/año distinto/.test(x))).toBe(true);
  });

  it('acepta ajusteFecha en mes siguiente cuando semana cruza mes', () => {
    // Semana 29 sep → 5 oct, ajuste el 3 oct: mes siguiente, válido
    const b = baseBlock({
      weekStart:      '2026-09-29',
      diasHabiles:    [29, 30, 1, 2, 5],
      ajusteFecha:    '2026-10-03',
      totalDepositos: 14507 * 5 + 14511.5,
    });
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(true);
  });

  it('detecta duplicado día ajuste vs día hábil (mismo mes)', () => {
    const b = baseBlock({
      diasHabiles: [1, 2, 3, 4, 8],
      ajusteFecha: '2026-09-08',
    });
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /mismo día/.test(x))).toBe(true);
  });

  it('duplicado calendárico correcto en semana cross-month (día 30 = 30 sep)', () => {
    const b = baseBlock({
      weekStart:      '2026-09-29',
      diasHabiles:    [29, 30, 1, 2, 5], // 29-30 sep + 1-2-5 oct
      ajusteFecha:    '2026-09-30',       // duplica día 30 sep de diasHabiles
      totalDepositos: 14507 * 5 + 14511.5,
    });
    const r = checkConfidence({ block: b });
    expect(r.autoApprove).toBe(false);
    expect(r.reasons.some(x => /mismo día/.test(x))).toBe(true);
  });

  it('NO flaggea duplicado cuando el número coincide pero el mes real difiere', () => {
    // Antes: parseInt(ajuste.slice(8,10)) = 1, setDias.has(1) = true → falso
    // positivo. Ahora: diasHabiles "1" resuelve a 2026-10-01, ajusteFecha
    // 2026-09-01 no colisiona (aunque el número sea igual).
    const b = baseBlock({
      weekStart:      '2026-09-29',
      diasHabiles:    [29, 30, 1, 2, 5], // "1" = 1 de OCTUBRE
      ajusteFecha:    '2026-09-01',       // 1 de SEPTIEMBRE (día distinto)
      totalDepositos: 14507 * 5 + 14511.5,
    });
    const r = checkConfidence({ block: b });
    // No debe reportar duplicado (es el problema del bug pre-fix).
    expect(r.reasons.some(x => /mismo día/.test(x))).toBe(false);
  });
});
