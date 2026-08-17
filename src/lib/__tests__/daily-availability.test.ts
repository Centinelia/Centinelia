import { describe, it, expect } from 'vitest';
import { formatDailyAvailabilityForPrompt, validateDailyAvailability } from '../daily-availability';

describe('formatDailyAvailabilityForPrompt', () => {
  it('returns empty string when data is null', () => {
    expect(formatDailyAvailabilityForPrompt(null, 'restaurante')).toBe('');
  });

  it('formats restaurante block with title, agotados y especial', () => {
    const out = formatDailyAvailabilityForPrompt(
      {
        updated_at: '2026-08-17T10:00:00Z',
        updated_by: 'owner@x.com',
        unavailable: ['Ceviche', 'Arrachera'],
        limited: ['Postre de la casa'],
        special: 'Tacos de barbacoa a 180',
        notes: null,
      },
      'restaurante',
    );
    expect(out).toContain('Disponibilidad del menú');
    expect(out).toContain('Ceviche');
    expect(out).toContain('Arrachera');
    expect(out).toContain('Tacos de barbacoa a 180');
    expect(out).toContain('Postre de la casa');
  });

  it('instructs to offer the special proactively', () => {
    const out = formatDailyAvailabilityForPrompt(
      {
        updated_at: '2026-08-17T10:00:00Z',
        updated_by: 'owner@x.com',
        unavailable: [],
        limited: [],
        special: 'Tacos de barbacoa a 180',
        notes: null,
      },
      'restaurante',
    );
    expect(out).toMatch(/ofrécelo proactivamente/);
  });

  it('instructs to mention unavailable items only when the client asks for one', () => {
    const out = formatDailyAvailabilityForPrompt(
      {
        updated_at: '2026-08-17T10:00:00Z',
        updated_by: 'owner@x.com',
        unavailable: ['Ceviche'],
        limited: [],
        special: null,
        notes: null,
      },
      'restaurante',
    );
    expect(out).toMatch(/SOLO si el cliente pide alguno/);
    expect(out).toMatch(/NUNCA los enumeres/);
  });

  it('places the special before unavailable items so the model sees the proactive item first', () => {
    const out = formatDailyAvailabilityForPrompt(
      {
        updated_at: '2026-08-17T10:00:00Z',
        updated_by: 'owner@x.com',
        unavailable: ['Ceviche'],
        limited: [],
        special: 'Tacos de barbacoa a 180',
        notes: null,
      },
      'restaurante',
    );
    expect(out.indexOf('Especial del día')).toBeLessThan(out.indexOf('No disponibles hoy'));
  });
});

describe('validateDailyAvailability', () => {
  it('throws when unavailable is not array', () => {
    expect(() => validateDailyAvailability({ unavailable: 'nope' })).toThrow();
  });

  it('accepts minimal valid object', () => {
    const v = validateDailyAvailability({
      updated_at: '2026-08-17T10:00:00Z',
      updated_by: 'x@y.com',
      unavailable: [],
      limited: [],
      special: null,
      notes: null,
    });
    expect(v.updated_by).toBe('x@y.com');
  });
});
