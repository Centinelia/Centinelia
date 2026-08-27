import { describe, it, expect } from 'vitest';
import { normalizeToE164 } from './dedup';

describe('normalizeToE164', () => {
  it('preserves E.164 numbers already formatted', () => {
    expect(normalizeToE164('+528112803360')).toBe('+528112803360');
    expect(normalizeToE164('+18005551234')).toBe('+18005551234');
  });

  it('strips punctuation inside E.164 numbers', () => {
    expect(normalizeToE164('+52 (81) 1280-3360')).toBe('+528112803360');
  });

  it('assumes Mexico for 10-digit input', () => {
    expect(normalizeToE164('8112803360')).toBe('+528112803360');
    expect(normalizeToE164('81 1280 3360')).toBe('+528112803360');
    expect(normalizeToE164('(81) 1280-3360')).toBe('+528112803360');
  });

  it('adds "+" to 12-digit numbers starting with 52', () => {
    expect(normalizeToE164('528112803360')).toBe('+528112803360');
  });

  it('adds "+" to 11-digit numbers starting with 1 (US/CA)', () => {
    expect(normalizeToE164('18005551234')).toBe('+18005551234');
  });

  it('best-effort prepends "+" for anything else with digits', () => {
    expect(normalizeToE164('442012345678')).toBe('+442012345678'); // UK
  });

  it('trims whitespace', () => {
    expect(normalizeToE164('  8112803360  ')).toBe('+528112803360');
  });
});
