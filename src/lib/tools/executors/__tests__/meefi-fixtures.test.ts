import { describe, it, expect } from 'vitest';
import { getMeefiUser, MEEFI_USERS } from '../../fixtures/meefi-users';
import { getMeefiTransfer, MEEFI_TRANSFERS } from '../../fixtures/meefi-transfers';

describe('meefi fixtures', () => {
  it('has 6+ users with variety of flags', () => {
    expect(MEEFI_USERS.length).toBeGreaterThanOrEqual(6);
    const locked = MEEFI_USERS.filter(u => u.flags.password_reset_locked);
    const unverified = MEEFI_USERS.filter(u => !u.flags.identity_verified);
    expect(locked.length).toBeGreaterThan(0);
    expect(unverified.length).toBeGreaterThan(0);
  });

  it('getMeefiUser finds by email case-insensitive', () => {
    const u = getMeefiUser('demo1@meefi.io');
    expect(u).toBeDefined();
    expect(u!.email.toLowerCase()).toBe('demo1@meefi.io');
  });

  it('has all 3 transfer statuses represented', () => {
    const statuses = new Set(MEEFI_TRANSFERS.map(t => t.status));
    expect(statuses.has('pendiente_rieles')).toBe(true);
    expect(statuses.has('rechazada')).toBe(true);
    expect(statuses.has('ya_conciliada')).toBe(true);
  });

  it('getMeefiTransfer matches by amount+date approx', () => {
    const t = getMeefiTransfer({ amount: 50000, date_approx: '2026-09-10' });
    expect(t).toBeDefined();
  });
});
