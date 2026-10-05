/**
 * Tests para scripts/check-cron-frequencies.mjs — el linter que fija
 * los intervalos mínimos de crons costosos. Previene que un cron
 * previamente bajado (ej. nash-monitor en PR #112) suba por descuido.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCronIntervalMinutes,
  findCronViolations,
  PROTECTED_CRONS,
} from '../../scripts/check-cron-frequencies.mjs';

describe('parseCronIntervalMinutes', () => {
  it.each([
    // [schedule, expectedMinutes, descripcion]
    ['*/5 * * * *',   5,     'cada 5 min'],
    ['*/15 * * * *',  15,    'cada 15 min'],
    ['*/30 * * * *',  30,    'cada 30 min'],
    ['0 * * * *',     60,    'cada hora (minuto 0)'],
    ['30 * * * *',    60,    'cada hora (minuto 30)'],
    ['0 */2 * * *',   120,   'cada 2 horas'],
    ['0 */4 * * *',   240,   'cada 4 horas (nash post-PR#112)'],
    ['0 */6 * * *',   360,   'cada 6 horas'],
    ['0 0 * * *',     1440,  'una vez al día'],
    ['0 9 * * *',     1440,  'una vez al día a las 9'],
    ['0 0 * * 1',     10080, 'una vez por semana (lunes)'],
  ])('"%s" → %i minutos (%s)', (schedule, expected) => {
    expect(parseCronIntervalMinutes(schedule)).toBe(expected);
  });

  it('devuelve null para schedules no reconocidos', () => {
    expect(parseCronIntervalMinutes('30,45 * * * *')).toBeNull();   // dos valores
    expect(parseCronIntervalMinutes('0 9-17 * * *')).toBeNull();     // rango
    expect(parseCronIntervalMinutes('* * *')).toBeNull();            // menos de 5 campos
  });
});

describe('findCronViolations', () => {
  let dir: string;
  let vercelPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'check-cron-'));
    vercelPath = join(dir, 'vercel.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeVercelConfig(crons: Array<{ path: string; schedule: string }>) {
    await writeFile(vercelPath, JSON.stringify({ crons }, null, 2));
  }

  it('reporta cuando un cron protegido va MÁS seguido que el mínimo', async () => {
    await writeVercelConfig([{ path: '/test/cron', schedule: '0 * * * *' }]);
    const protectedCrons = [{ path: '/test/cron', minMinutes: 240, reason: 'test' }];
    const violations = await findCronViolations({ vercelJsonPath: vercelPath, protectedCrons });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind:          'too_frequent',
      path:          '/test/cron',
      actualMinutes: 60,
      minMinutes:    240,
    });
  });

  it('no reporta cuando el cron corre exactamente al mínimo', async () => {
    await writeVercelConfig([{ path: '/test/cron', schedule: '0 */4 * * *' }]);
    const protectedCrons = [{ path: '/test/cron', minMinutes: 240, reason: 'test' }];
    const violations = await findCronViolations({ vercelJsonPath: vercelPath, protectedCrons });
    expect(violations).toEqual([]);
  });

  it('no reporta cuando el cron corre MENOS seguido que el mínimo', async () => {
    await writeVercelConfig([{ path: '/test/cron', schedule: '0 */6 * * *' }]);
    const protectedCrons = [{ path: '/test/cron', minMinutes: 240, reason: 'test' }];
    const violations = await findCronViolations({ vercelJsonPath: vercelPath, protectedCrons });
    expect(violations).toEqual([]);
  });

  it('reporta cuando un cron protegido fue removido del vercel.json', async () => {
    await writeVercelConfig([{ path: '/otro/cron', schedule: '0 */4 * * *' }]);
    const protectedCrons = [{ path: '/test/cron', minMinutes: 240, reason: 'test' }];
    const violations = await findCronViolations({ vercelJsonPath: vercelPath, protectedCrons });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('missing');
  });

  it('reporta cuando el schedule no se puede parsear', async () => {
    await writeVercelConfig([{ path: '/test/cron', schedule: '30,45 * * * *' }]);
    const protectedCrons = [{ path: '/test/cron', minMinutes: 240, reason: 'test' }];
    const violations = await findCronViolations({ vercelJsonPath: vercelPath, protectedCrons });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('unparseable');
  });
});

describe('red de contención contra vercel.json real', () => {
  it('la vercel.json actual pasa todas las protecciones', async () => {
    const repoRoot = join(__dirname, '..', '..');
    const violations = await findCronViolations({
      vercelJsonPath: join(repoRoot, 'vercel.json'),
    });
    expect(violations).toEqual([]);
  });

  it('PROTECTED_CRONS incluye al menos nash-monitor (post-PR#112)', () => {
    const nashProtection = PROTECTED_CRONS.find(p => p.path === '/api/cron/nash-monitor');
    expect(nashProtection).toBeTruthy();
    expect(nashProtection!.minMinutes).toBeGreaterThanOrEqual(240);
  });
});
