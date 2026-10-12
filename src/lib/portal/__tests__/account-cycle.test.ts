// Regression tests para el bug Tortillería 2026-10-12.
// Antes del fix: pool-projection-alerts leía voice_agents.minutes_reset_date
// (stale para Stripe) → "28 días restantes" cuando account_minutes.reset_date
// decía 2026-11-01 (19 días). Después del fix: computeAccountCycle usa
// account_minutes como fuente única.

import { describe, it, expect } from 'vitest';
import { computeAccountCycle } from '../account-cycle';

describe('computeAccountCycle', () => {
  const now = new Date('2026-10-12T15:00:00-06:00'); // hoy MX

  it('escenario Tortillería real: account=2026-11-01, agent=stale 2026-10-08', () => {
    const cycle = computeAccountCycle({
      accountResetDate: '2026-11-01',
      agentResetDate:   '2026-10-08',  // stale, debe ser ignorada
      now,
    });
    expect(cycle).not.toBeNull();
    expect(cycle!.fromAccountMinutes).toBe(true);
    expect(cycle!.resetDate).toBe('2026-11-01');
    expect(cycle!.cycleStart).toBe('2026-10-01');
    expect(cycle!.cycleEnd).toBe('2026-11-01');
    expect(cycle!.daysInCycle).toBe(31);
    // Oct 12 - Oct 1 = 11 días
    expect(cycle!.daysSinceReset).toBe(11);
    // Nov 1 - Oct 12 = 20 días ceil
    expect(cycle!.daysLeftInCycle).toBe(20);
  });

  it('NO vuelve a leer el agent stale aunque account sea null — regresa null', () => {
    const cycle = computeAccountCycle({ accountResetDate: null, agentResetDate: null, now });
    expect(cycle).toBeNull();
  });

  it('fallback a agent cuando account es null (standalone sin portal_email)', () => {
    const cycle = computeAccountCycle({
      accountResetDate: null,
      agentResetDate:   '2026-11-01', // standalone también usa día 1 (reset-minutes cron)
      now,
    });
    expect(cycle).not.toBeNull();
    expect(cycle!.fromAccountMinutes).toBe(false);
    expect(cycle!.daysLeftInCycle).toBe(20);
  });

  it('resetDate pasado (edge case): daysLeftInCycle=0, daysSinceReset>=daysInCycle', () => {
    const cycle = computeAccountCycle({
      accountResetDate: '2026-10-01', // ya pasó
      now: new Date('2026-10-12T15:00:00-06:00'),
    });
    expect(cycle!.daysLeftInCycle).toBe(0);
    expect(cycle!.daysSinceReset).toBeGreaterThanOrEqual(cycle!.daysInCycle);
  });

  it('fecha inválida regresa null', () => {
    expect(computeAccountCycle({ accountResetDate: 'not-a-date', now })).toBeNull();
  });

  it('ciclo febrero (28 días) se calcula correcto', () => {
    const feb = new Date('2026-02-15T12:00:00-06:00');
    const cycle = computeAccountCycle({ accountResetDate: '2026-03-01', now: feb });
    expect(cycle!.daysInCycle).toBe(28);
    expect(cycle!.cycleStart).toBe('2026-02-01');
  });
});
