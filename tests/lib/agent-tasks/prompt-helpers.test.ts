/**
 * Unit tests para src/lib/agent-tasks/prompt-helpers.ts.
 *
 * Cubre:
 * - humanReadableCron: conversión de expresiones cron a español
 * - describeTrigger: descripción de triggers en lenguaje natural
 */
import { describe, it, expect } from 'vitest';
import { humanReadableCron, describeTrigger } from '@/lib/agent-tasks/prompt-helpers';

describe('humanReadableCron', () => {
  it('convierte "0 9 5 * *" a "día 5 de cada mes a las 9:00"', () => {
    expect(humanReadableCron('0 9 5 * *')).toBe('día 5 de cada mes a las 9:00');
  });

  it('convierte "0 9 * * 1" a "lunes a las 9:00"', () => {
    expect(humanReadableCron('0 9 * * 1')).toBe('lunes a las 9:00');
  });

  it('convierte "0 9 * * *" a "todos los días a las 9:00"', () => {
    expect(humanReadableCron('0 9 * * *')).toBe('todos los días a las 9:00');
  });

  it('convierte "* * * * *" a "cada minuto"', () => {
    expect(humanReadableCron('* * * * *')).toBe('cada minuto');
  });

  it('convierte "*/5 * * * *" a "cada 5 minutos"', () => {
    expect(humanReadableCron('*/5 * * * *')).toBe('cada 5 minutos');
  });

  it('hace fallback al string original si no reconoce el patrón', () => {
    const exotic = '0 9 L * *';
    expect(humanReadableCron(exotic)).toBe(exotic);
  });

  it('maneja cadena vacía sin lanzar', () => {
    expect(humanReadableCron('')).toBe('');
  });

  it('convierte "30 14 * * 5" a "viernes a las 14:30"', () => {
    expect(humanReadableCron('30 14 * * 5')).toBe('viernes a las 14:30');
  });

  it('convierte "0 8 * * 0" a "domingo a las 8:00"', () => {
    expect(humanReadableCron('0 8 * * 0')).toBe('domingo a las 8:00');
  });
});

describe('describeTrigger', () => {
  it('cron retorna texto legible en español', () => {
    const result = describeTrigger('cron', { cron: '0 9 * * *' });
    expect(result).toBe('todos los días a las 9:00');
  });

  it('phrase retorna lista de frases separadas por coma', () => {
    const result = describeTrigger('phrase', { phrases: ['dame el reporte', 'resumen diario'] });
    expect(result).toContain('dame el reporte');
    expect(result).toContain('resumen diario');
  });

  it('manual retorna texto de portal', () => {
    const result = describeTrigger('manual', {});
    expect(result).toBe('solo manual desde el portal');
  });

  it('tipo desconocido cae en fallback de manual', () => {
    const result = describeTrigger('otro_tipo', {});
    expect(result).toBe('solo manual desde el portal');
  });

  it('cron con expresión exótica hace fallback al string', () => {
    const result = describeTrigger('cron', { cron: '0 9 L * *' });
    expect(result).toBe('0 9 L * *');
  });
});
