import { describe, it, expect } from 'vitest';
import { isValidE164, maskPhoneNumber } from '@/lib/billing/fallback-validate';

describe('isValidE164', () => {
  it('accepts a valid Mexican number', () => {
    expect(isValidE164('+528112345678')).toBe(true);
  });
  it('rejects missing plus', () => {
    expect(isValidE164('528112345678')).toBe(false);
  });
  it('rejects leading zero after plus', () => {
    expect(isValidE164('+0528112345678')).toBe(false);
  });
  it('rejects null / undefined / empty', () => {
    expect(isValidE164(null)).toBe(false);
    expect(isValidE164(undefined)).toBe(false);
    expect(isValidE164('')).toBe(false);
  });
  it('rejects letters', () => {
    expect(isValidE164('+52abc12345')).toBe(false);
  });
  it('rejects too short', () => {
    expect(isValidE164('+521234567')).toBe(false);
  });
});

describe('maskPhoneNumber', () => {
  it('masks a 13-char Mexican number', () => {
    expect(maskPhoneNumber('+528112345678')).toBe('+52 81 **** 5678');
  });
  it('returns raw if too short to mask', () => {
    expect(maskPhoneNumber('+5281')).toBe('+5281');
  });
});
