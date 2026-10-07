import { describe, it, expect } from 'vitest';
import { extractSeerRefVolts, extractTonelada, inferFamilia } from '../equipo-helpers';

describe('extractSeerRefVolts — bugs reportados por Nazre en OC 6203 real (2026-10-07)', () => {
  it('BUG FIX: SEER en formato "SEER19" (pegado antes del número)', () => {
    const d = 'Evaporador High Wall Panel Cristal Inverter SEER19 1.5TR';
    expect(extractSeerRefVolts(d).seer).toBe('19');
  });

  it('SEER en formato "19 SEER" (orden inverso, histórico)', () => {
    expect(extractSeerRefVolts('EQUIPO 19 SEER R-410A 1.5TR').seer).toBe('19');
  });

  it('BUG FIX: REF no debe matchear "R19" dentro de "SEER19"', () => {
    const d = 'Evaporador High Wall Panel Cristal Inverter SEER19 1.5TR';
    expect(extractSeerRefVolts(d).ref).toBeUndefined();
  });

  it('REF sí matchea "R410" cuando viene separado', () => {
    expect(extractSeerRefVolts('MINI SPLIT 1.5TR R410A').ref).toBe('R410');
    expect(extractSeerRefVolts('CONDENSADORA R-410A SEER19').ref).toBe('R410');
    expect(extractSeerRefVolts('EVAPORADOR R32 SEER22').ref).toBe('R32');
  });

  it('REF no matchea R19 solo pero SÍ matchea cualquier otro R separado', () => {
    expect(extractSeerRefVolts('SEER19 1.5TR').ref).toBeUndefined();
    expect(extractSeerRefVolts('SEER19 R410A 1.5TR').ref).toBe('R410');
  });

  it('VOLTS parse normal', () => {
    expect(extractSeerRefVolts('Compresor 230/3/60 20TR').volts).toBe('230/3/60');
    expect(extractSeerRefVolts('Trifásico 460/3/60 R410').volts).toBe('460/3/60');
  });

  it('Caso real OC 6203 — Evaporador 4MXW2318CF000AA', () => {
    const d = 'Evaporador High Wall Panel Cristal Inverter SEER19 1.5TR';
    const r = extractSeerRefVolts(d);
    expect(r.seer).toBe('19');
    expect(r.ref).toBeUndefined();  // No está en la descripción
  });

  it('Caso real OC 6203 — Condensador 4TXK2318CFP00AA', () => {
    const d = 'Condensador Inverter SEER19 1.5TR Frío-Calor';
    const r = extractSeerRefVolts(d);
    expect(r.seer).toBe('19');
    expect(r.ref).toBeUndefined();
  });
});

describe('extractTonelada — bug 1.5TR reportado Nazre OC 6203', () => {
  it('BUG FIX: "1.5TR" → 1.5 (antes extraía 5)', () => {
    expect(extractTonelada('Evaporador 1.5TR', '4MXW2318CF000AA')).toBe(1.5);
    expect(extractTonelada('Condensador Inverter SEER19 1.5TR Frío-Calor', '4TXK2318CFP00AA')).toBe(1.5);
  });

  it('"1,5TR" (coma decimal) → 1.5', () => {
    expect(extractTonelada('EVAP 1,5TR', 'X')).toBe(1.5);
  });

  it('"2.5TR" → 2.5', () => {
    expect(extractTonelada('MINI SPLIT 2.5TR', 'X')).toBe(2.5);
  });

  it('"20TR" → 20 (entero sin decimal, regresión)', () => {
    expect(extractTonelada('MANEJADORA 20TR SEER12', 'X')).toBe(20);
  });

  it('MBH funciona sin cambio', () => {
    expect(extractTonelada('EQUIPO 36MBH', 'X')).toBe(3);
    expect(extractTonelada('UMA 60MBH SEER11', 'X')).toBe(5);
  });

  it('MSP del modelo funciona sin cambio', () => {
    expect(extractTonelada('MINI SPLIT', '1612')).toBe(1);
    expect(extractTonelada('MINI SPLIT', '1636')).toBe(3);
  });

  it('No match → null', () => {
    expect(extractTonelada('Equipo genérico', 'X')).toBeNull();
  });

  it('Rechaza TR fuera de rango (0.5-60)', () => {
    expect(extractTonelada('99TR', 'X')).toBeNull();
    expect(extractTonelada('0TR', 'X')).toBeNull();
  });
});

describe('inferFamilia — bug 2026-10-07 Nazre OC 6203: no inventar familias', () => {
  const familiasCatalogo = {};
  const empty = new Map<string, Map<string, number>>();

  it('BUG FIX: no retorna "EVAPORADORA" literal si no existe en familiasValidas', () => {
    const familiasValidas = new Set(['MSP SEER19', 'MSP SEER22', 'MANEJADORA 20TR']);
    const r = inferFamilia(
      'Evaporador High Wall Panel Cristal Inverter SEER19 1.5TR',
      '4MXW2318CF000AA',
      familiasCatalogo,
      empty,
      familiasValidas,
    );
    expect(r).not.toBe('EVAPORADORA');
    // No hay match EVAP en el set → busca MSP SEER19 por el patrón MINI-SPLIT? no, no es MSP.
    // Fallback: vacío (humano llena)
    expect(r).toBe('');
  });

  it('BUG FIX: no retorna "CONDENSADORA" literal si no existe en familiasValidas', () => {
    const familiasValidas = new Set(['MSP SEER19', 'EVAP SPLIT']);
    const r = inferFamilia(
      'Condensador Inverter SEER19 1.5TR Frío-Calor',
      '4TXK2318CFP00AA',
      familiasCatalogo,
      empty,
      familiasValidas,
    );
    expect(r).not.toBe('CONDENSADORA');
    expect(r).toBe('');
  });

  it('SÍ retorna familia válida existente cuando descripción matchea', () => {
    const familiasValidas = new Set(['EVAP SPLIT', 'COND INVERTER', 'MANEJADORA 20TR']);
    expect(inferFamilia('Evaporador Inverter', 'X', familiasCatalogo, empty, familiasValidas)).toBe('EVAP SPLIT');
    expect(inferFamilia('Condensador Trane', 'X', familiasCatalogo, empty, familiasValidas)).toBe('COND INVERTER');
    expect(inferFamilia('Manejadora 20TR', 'X', familiasCatalogo, empty, familiasValidas)).toBe('MANEJADORA 20TR');
  });

  it('Precedente histórico gana sobre descripción (fuente de verdad del Excel)', () => {
    const familiasPorModelo = new Map([
      ['4MXW2318CF000AA', new Map([['MSP SEER19', 10], ['OTRA', 2]])],
    ]);
    const familiasValidas = new Set(['MSP SEER19', 'OTRA']);
    const r = inferFamilia(
      'Evaporador bla bla',
      '4MXW2318CF000AA',
      familiasCatalogo,
      familiasPorModelo,
      familiasValidas,
    );
    expect(r).toBe('MSP SEER19');
  });

  it('Catálogo de usuario gana sobre todo lo demás', () => {
    const familiasPorModelo = new Map([
      ['4MXW2318CF000AA', new Map([['MSP SEER19', 10]])],
    ]);
    const familiasValidas = new Set(['MSP SEER19']);
    const r = inferFamilia(
      'Evaporador',
      '4MXW2318CF000AA',
      { '4MXW2318CF000AA': 'FAMILIA_MANUAL' },
      familiasPorModelo,
      familiasValidas,
    );
    expect(r).toBe('FAMILIA_MANUAL');
  });

  it('Sin familiasValidas (legacy call) usa patrones hardcoded como antes — retrocompat', () => {
    // Para no romper call-sites que no pasan familiasValidas (ej. tests legacy)
    const r = inferFamilia('MINI SPLIT SEER19', 'X', familiasCatalogo, empty);
    expect(r).toBe('MSP SEER19');
  });
});
