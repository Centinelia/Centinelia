import { describe, it, expect } from 'vitest';
import { evaluateElevenLabsPace } from '../elevenlabs-pace';

// Fijamos "ahora" para que los cálculos sean deterministas.
// Elegimos 2026-10-06 12:00:00 UTC (día 15 de un ciclo que resetea 2026-10-21).
const NOW_UNIX     = Math.floor(new Date('2026-10-06T12:00:00Z').getTime() / 1000);
const RESET_UNIX   = Math.floor(new Date('2026-10-21T12:00:00Z').getTime() / 1000);
const CHAR_LIMIT   = 100_000;

describe('evaluateElevenLabsPace', () => {
  it('devuelve ok cuando el consumo va al ritmo justo', () => {
    // día 15 de 30 → esperado ~50% del límite
    const r = evaluateElevenLabsPace(50_000, CHAR_LIMIT, RESET_UNIX, NOW_UNIX);
    expect(r.level).toBe('ok');
    expect(r.pace).toBeCloseTo(1.0, 1);
    expect(r.usedPct).toBeCloseTo(50, 0);
  });

  it('devuelve ok cuando el consumo está por debajo del ritmo', () => {
    // día 15, solo 30% consumido → pace 0.6
    const r = evaluateElevenLabsPace(30_000, CHAR_LIMIT, RESET_UNIX, NOW_UNIX);
    expect(r.level).toBe('ok');
    expect(r.pace).toBeLessThan(1);
  });

  it('devuelve warn cuando el pace supera 1.25 pero no 1.5', () => {
    // día 15, 65% consumido → pace 1.3
    const r = evaluateElevenLabsPace(65_000, CHAR_LIMIT, RESET_UNIX, NOW_UNIX);
    expect(r.level).toBe('warn');
    expect(r.pace).toBeGreaterThan(1.25);
    expect(r.pace).toBeLessThan(1.5);
  });

  it('devuelve critical cuando el pace supera 1.5', () => {
    // día 15, 80% consumido → pace 1.6
    const r = evaluateElevenLabsPace(80_000, CHAR_LIMIT, RESET_UNIX, NOW_UNIX);
    expect(r.level).toBe('critical');
    expect(r.pace).toBeGreaterThanOrEqual(1.5);
  });

  it('devuelve critical cuando el % absoluto supera 90 aunque el pace sea normal', () => {
    // día 28 del ciclo (2 días para reset), 95% consumido → pace apenas > 1
    // pero el % absoluto ya es peligroso.
    const day28 = Math.floor(new Date('2026-10-19T12:00:00Z').getTime() / 1000);
    const r = evaluateElevenLabsPace(95_000, CHAR_LIMIT, RESET_UNIX, day28);
    expect(r.level).toBe('critical');
    expect(r.usedPct).toBeGreaterThanOrEqual(90);
  });

  it('devuelve critical cuando el % absoluto supera 75 aunque el pace sea aceptable — pero por warn no critical', () => {
    // día 25, 78% consumido → pace ~0.94 (ok) pero % ya en zona warn
    const day25 = Math.floor(new Date('2026-10-16T12:00:00Z').getTime() / 1000);
    const r = evaluateElevenLabsPace(78_000, CHAR_LIMIT, RESET_UNIX, day25);
    expect(r.level).toBe('warn');
    expect(r.usedPct).toBeGreaterThanOrEqual(75);
    expect(r.usedPct).toBeLessThan(90);
  });

  it('detecta consumo agresivo temprano en el ciclo', () => {
    // día 5 del ciclo, 30% consumido → pace 1.8
    // Esta es la señal más valiosa: te avisa a tiempo, no al final.
    const day5 = Math.floor(new Date('2026-09-26T12:00:00Z').getTime() / 1000);
    const r = evaluateElevenLabsPace(30_000, CHAR_LIMIT, RESET_UNIX, day5);
    expect(r.level).toBe('critical');
    expect(r.pace).toBeGreaterThan(1.5);
    expect(r.usedPct).toBeLessThan(75); // el % absoluto está tranquilo, es el pace el que dispara
  });

  it('reproduce el estado real medido 2026-09-22 y confirma que NO manda alerta', () => {
    // Caso base — el que motivó el análisis. Cuenta pneumastudiomx en plan
    // Creator arriba de 121K rollover, 2,081 chars consumidos día 1 del ciclo.
    const nowReal   = Math.floor(new Date('2026-09-22T15:00:00Z').getTime() / 1000);
    const resetReal = Math.floor(new Date('2026-10-21T21:10:03Z').getTime() / 1000);
    const r = evaluateElevenLabsPace(2081, 121_000, resetReal, nowReal);
    expect(r.level).toBe('ok');
    expect(r.pace).toBeLessThan(1);
  });

  it('no divide por cero si el ciclo apenas empezó', () => {
    // 1 segundo transcurrido — daysElapsed se clampa a 0.1
    const startedNow = RESET_UNIX - 1;
    const r = evaluateElevenLabsPace(0, CHAR_LIMIT, RESET_UNIX, startedNow);
    expect(r.level).toBe('ok');
    expect(Number.isFinite(r.pace)).toBe(true);
  });
});
