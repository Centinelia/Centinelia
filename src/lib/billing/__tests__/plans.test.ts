import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FEATURE_PLAN_CONFIG,
  TIER_LABELS,
  TIER_PRICE_MXN,
  JORNADA_CONFIG,
  NOX_JORNADA_CONFIG,
  jornadaConfigFromPriceId,
  resolveTierAllocation,
  nextResetDate,
  MINUTES_RATE_IN_PLAN,
  MINUTES_RATE_EXTRA,
  PLAN_BASE_MXN,
} from '../plans';

describe('plans.ts — constantes de tier', () => {
  it('TIER_LABELS mapea los 4 tiers', () => {
    expect(TIER_LABELS.starter).toBe('Esencial');
    expect(TIER_LABELS.growth).toBe('Profesional');
    expect(TIER_LABELS.scale).toBe('Alta Demanda');
    expect(TIER_LABELS.enterprise).toBe('Empresarial');
  });

  it('TIER_PRICE_MXN escalona 2997 / 5994 / 11988 / 0', () => {
    expect(TIER_PRICE_MXN.starter).toBe(2997);
    expect(TIER_PRICE_MXN.growth).toBe(5994);
    expect(TIER_PRICE_MXN.scale).toBe(11988);
    expect(TIER_PRICE_MXN.enterprise).toBe(0);
  });

  it('growth cuesta el doble que starter y scale 4x', () => {
    expect(TIER_PRICE_MXN.growth).toBe(TIER_PRICE_MXN.starter * 2);
    expect(TIER_PRICE_MXN.scale).toBe(TIER_PRICE_MXN.starter * 4);
  });
});

describe('plans.ts — JORNADA_CONFIG allocations', () => {
  it('combinada devuelve mix minutos + tareas', () => {
    expect(JORNADA_CONFIG.combinada.starter).toMatchObject({ minutes: 250,  aiOps: 300  });
    expect(JORNADA_CONFIG.combinada.growth ).toMatchObject({ minutes: 500,  aiOps: 600  });
    expect(JORNADA_CONFIG.combinada.scale  ).toMatchObject({ minutes: 1000, aiOps: 1200 });
  });

  it('minutos (voz-heavy) devuelve muchos minutos + pocas tareas', () => {
    // Rebalance 2026-09-22: Solo Minutos = 350/650/1300 (margen ~69-71%, trade tareas→min razonable).
    expect(JORNADA_CONFIG.minutos.starter).toMatchObject({ minutes: 350,  aiOps: 20 });
    expect(JORNADA_CONFIG.minutos.growth ).toMatchObject({ minutes: 650,  aiOps: 20 });
    expect(JORNADA_CONFIG.minutos.scale  ).toMatchObject({ minutes: 1300, aiOps: 20 });
  });

  it('tareas (ops-heavy) devuelve 0 minutos + muchas tareas', () => {
    expect(JORNADA_CONFIG.tareas.starter).toMatchObject({ minutes: 0, aiOps: 500  });
    expect(JORNADA_CONFIG.tareas.growth ).toMatchObject({ minutes: 0, aiOps: 1200 });
    expect(JORNADA_CONFIG.tareas.scale  ).toMatchObject({ minutes: 0, aiOps: 3000 });
  });

  it('enterprise siempre queda en 0/0', () => {
    for (const jornada of ['combinada', 'minutos', 'tareas'] as const) {
      expect(JORNADA_CONFIG[jornada].enterprise.minutes).toBe(0);
      expect(JORNADA_CONFIG[jornada].enterprise.aiOps).toBe(0);
    }
  });

  it('todas las combinaciones comparten el precio del tier', () => {
    for (const jornada of ['combinada', 'minutos', 'tareas'] as const) {
      for (const tier of ['starter', 'growth', 'scale', 'enterprise'] as const) {
        expect(JORNADA_CONFIG[jornada][tier].mxn).toBe(TIER_PRICE_MXN[tier]);
      }
    }
  });

  it('todas las combinaciones comparten el label del tier', () => {
    for (const jornada of ['combinada', 'minutos', 'tareas'] as const) {
      for (const tier of ['starter', 'growth', 'scale', 'enterprise'] as const) {
        expect(JORNADA_CONFIG[jornada][tier].label).toBe(TIER_LABELS[tier]);
      }
    }
  });
});

describe('plans.ts — NOX_JORNADA_CONFIG', () => {
  it('escalona ops sin voz', () => {
    expect(NOX_JORNADA_CONFIG.starter).toMatchObject({ minutes: 0, aiOps:  500, mxn: 2997  });
    expect(NOX_JORNADA_CONFIG.growth ).toMatchObject({ minutes: 0, aiOps: 1200, mxn: 5994  });
    expect(NOX_JORNADA_CONFIG.scale  ).toMatchObject({ minutes: 0, aiOps: 3000, mxn: 11988 });
  });

  it('labels usan nomenclatura Coordinador (Media Jornada, Jornada Completa, Alta Demanda)', () => {
    expect(NOX_JORNADA_CONFIG.starter.label).toBe('Media Jornada');
    expect(NOX_JORNADA_CONFIG.growth.label).toBe('Jornada Completa');
    expect(NOX_JORNADA_CONFIG.scale.label).toBe('Alta Demanda');
  });
});

describe('plans.ts — jornadaConfigFromPriceId', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('devuelve null para priceId vacío', () => {
    expect(jornadaConfigFromPriceId('')).toBeNull();
  });

  it('devuelve null para priceId no matcheado', () => {
    process.env.STRIPE_COMBINADA_SCALE = 'price_valid_scale';
    expect(jornadaConfigFromPriceId('price_no_existe')).toBeNull();
  });

  it('matchea combinada scale', () => {
    process.env.STRIPE_COMBINADA_SCALE = 'price_test_combinada_scale';
    const result = jornadaConfigFromPriceId('price_test_combinada_scale');
    expect(result).toEqual({
      jornada: 'combinada',
      tier:    'scale',
      cfg:     expect.objectContaining({ minutes: 1000, aiOps: 1200, mxn: 11988 }),
      isCoordinator: false,
    });
  });

  it('matchea tareas growth', () => {
    process.env.STRIPE_TAREAS_GROWTH = 'price_test_tareas_growth';
    const result = jornadaConfigFromPriceId('price_test_tareas_growth');
    expect(result?.jornada).toBe('tareas');
    expect(result?.tier).toBe('growth');
    expect(result?.cfg.aiOps).toBe(1200);
    expect(result?.cfg.minutes).toBe(0);
    expect(result?.isCoordinator).toBe(false);
  });

  it('matchea minutos starter', () => {
    process.env.STRIPE_MINUTOS_STARTER = 'price_test_minutos_starter';
    const result = jornadaConfigFromPriceId('price_test_minutos_starter');
    expect(result?.jornada).toBe('minutos');
    expect(result?.cfg.minutes).toBe(350);
    expect(result?.cfg.aiOps).toBe(20);
  });

  it('matchea NOX (coordinator) scale', () => {
    process.env.STRIPE_NOX_SCALE = 'price_test_nox_scale';
    const result = jornadaConfigFromPriceId('price_test_nox_scale');
    expect(result?.jornada).toBe('coordinator');
    expect(result?.tier).toBe('scale');
    expect(result?.cfg.aiOps).toBe(3000);
    expect(result?.isCoordinator).toBe(true);
  });

  it('usa fallback STRIPE_PRO_SCALE si STRIPE_COMBINADA_SCALE no está seteado', () => {
    delete process.env.STRIPE_COMBINADA_SCALE;
    process.env.STRIPE_PRO_SCALE = 'price_legacy_pro_scale';
    const result = jornadaConfigFromPriceId('price_legacy_pro_scale');
    expect(result?.jornada).toBe('combinada');
    expect(result?.tier).toBe('scale');
  });

  it('primary env gana sobre legacy', () => {
    process.env.STRIPE_COMBINADA_SCALE = 'price_new';
    process.env.STRIPE_PRO_SCALE       = 'price_old';
    expect(jornadaConfigFromPriceId('price_new')?.tier).toBe('scale');
    expect(jornadaConfigFromPriceId('price_old')).toBeNull();
  });
});

describe('plans.ts — resolveTierAllocation', () => {
  it('devuelve JORNADA_CONFIG para meerkat no-coordinator', () => {
    expect(resolveTierAllocation('combinada', 'nelia', 'scale')).toEqual({ minutes: 1000, aiOps: 1200 });
    expect(resolveTierAllocation('minutos',   'nia',   'growth')).toEqual({ minutes: 650,  aiOps: 20   });
    expect(resolveTierAllocation('tareas',    'nala',  'starter')).toEqual({ minutes: 0,   aiOps: 500  });
  });

  it('devuelve NOX_JORNADA_CONFIG para coordinator (nox)', () => {
    expect(resolveTierAllocation('combinada', 'nox', 'scale')).toEqual({ minutes: 0, aiOps: 3000 });
    expect(resolveTierAllocation(undefined,   'nox', 'growth')).toEqual({ minutes: 0, aiOps: 1200 });
  });

  it('devuelve NOX_JORNADA_CONFIG para coordinator (niva)', () => {
    expect(resolveTierAllocation('tareas', 'niva', 'starter')).toEqual({ minutes: 0, aiOps: 500 });
  });

  it('default combinada cuando jornadaType es undefined', () => {
    expect(resolveTierAllocation(undefined, 'nelia', 'scale')).toEqual({ minutes: 1000, aiOps: 1200 });
  });

  it('coordinator ignora jornadaType (siempre tareas-only)', () => {
    expect(resolveTierAllocation('combinada', 'nox', 'scale')).toEqual({ minutes: 0, aiOps: 3000 });
    expect(resolveTierAllocation('minutos',   'nox', 'scale')).toEqual({ minutes: 0, aiOps: 3000 });
    expect(resolveTierAllocation('tareas',    'nox', 'scale')).toEqual({ minutes: 0, aiOps: 3000 });
  });
});

describe('plans.ts — FEATURE_PLAN_CONFIG', () => {
  it('pro setup fee es $14,990 + 300 ops límite', () => {
    expect(FEATURE_PLAN_CONFIG.pro.setupFee).toBe(14990);
    expect(FEATURE_PLAN_CONFIG.pro.aiOpsLimit).toBe(300);
    expect(FEATURE_PLAN_CONFIG.pro.label).toBe('Empleado Centinelia');
  });
});

describe('plans.ts — precios de referencia', () => {
  it('PLAN_BASE_MXN.pro = 0 (no hay base fee)', () => {
    expect(PLAN_BASE_MXN.pro).toBe(0);
  });

  it('rates de minutos son 9.99 in-plan y 12 extra', () => {
    expect(MINUTES_RATE_IN_PLAN).toBe(9.99);
    expect(MINUTES_RATE_EXTRA).toBe(12);
  });
});

describe('plans.ts — nextResetDate', () => {
  it('devuelve YYYY-MM-DD del primero del mes siguiente', () => {
    const result = nextResetDate();
    expect(result).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('el mes siguiente al mes actual', () => {
    const result = nextResetDate();
    const now = new Date();
    const [y, m] = result.split('-').map(Number);
    const expectedMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2; // JS months 0-indexed
    const expectedYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    expect(y).toBe(expectedYear);
    expect(m).toBe(expectedMonth);
  });
});
