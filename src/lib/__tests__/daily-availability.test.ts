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
