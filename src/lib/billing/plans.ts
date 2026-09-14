import type { Plan, JornadaType } from '@/types/agent';

export type { Plan };
export type MinutesTier = 'starter' | 'growth' | 'scale' | 'enterprise';
export type MinutesPlan = MinutesTier; // alias mantenido por compatibilidad con nombre de columna DB

// ─── Agent type (one-time setup fee) ─────────────────────────────────────────

export interface FeaturePlanConfig {
  label:        string;
  setupFee:     number;
  aiOpsLimit:   number;
  setupPriceId: () => string;
}

export const FEATURE_PLAN_CONFIG: Record<Plan, FeaturePlanConfig> = {
  pro: { label: 'Empleado Centinelia', setupFee: 14990, aiOpsLimit: 300, setupPriceId: () => process.env.STRIPE_SETUP_PRO! },
};

// ─── Precios base + minutos extra ────────────────────────────────────────────

export const PLAN_BASE_MXN: Record<Plan, number> = { pro: 0 };

export const MINUTES_RATE_IN_PLAN = 9.99;   // referencia interna, no facturable directo
export const MINUTES_RATE_EXTRA   = 12;      // compra puntual + auto-refill (pre-IVA)

// ─── Tier: labels y precios (jornada-independiente) ─────────────────────────
// Un mismo tier (starter/growth/scale) cuesta lo mismo en todas las jornadas.
// Lo que varía es la mezcla de recursos (minutos vs tareas) según jornada.

export const TIER_LABELS: Record<MinutesTier, string> = {
  starter:    'Esencial',
  growth:     'Profesional',
  scale:      'Alta Demanda',
  enterprise: 'Empresarial',
};

export const TIER_PRICE_MXN: Record<MinutesTier, number> = {
  starter:    2997,
  growth:     5994,
  scale:      11988,
  enterprise: 0,
};

// ─── Jornada plans: SOURCE OF TRUTH ──────────────────────────────────────────
// Un empleado se contrata con una "jornada" (combinada / minutos / tareas) +
// un "tier" (starter / growth / scale). Precio por tier, allocación por
// combinación jornada × tier. Coordinadores (Nox/Niva) NO usan esta tabla;
// usan NOX_JORNADA_CONFIG.
//
// El fallback legacy STRIPE_PRO_* aplica solo a combinada porque antes había
// un product único para "pro" que ahora se splitea por jornada. Retirar el
// fallback cuando los 9 nuevos STRIPE_* env vars estén poblados en Vercel prod.

export interface JornadaTierConfig {
  label:    string;
  minutes:  number;
  aiOps:    number;
  mxn:      number;
  priceId:  () => string;
}

function jt(
  tier:       MinutesTier,
  minutes:    number,
  aiOps:      number,
  primaryEnv: string,
  legacyEnv?: string,
): JornadaTierConfig {
  return {
    label:   TIER_LABELS[tier],
    minutes,
    aiOps,
    mxn:     TIER_PRICE_MXN[tier],
    priceId: () => process.env[primaryEnv] || (legacyEnv ? (process.env[legacyEnv] || '') : ''),
  };
}

export const JORNADA_CONFIG: Record<JornadaType, Record<MinutesTier, JornadaTierConfig>> = {
  combinada: {
    starter:    jt('starter',    250,  300,  'STRIPE_COMBINADA_STARTER', 'STRIPE_PRO_STARTER'),
    growth:     jt('growth',     500,  600,  'STRIPE_COMBINADA_GROWTH',  'STRIPE_PRO_GROWTH'),
    scale:      jt('scale',      1000, 1200, 'STRIPE_COMBINADA_SCALE',   'STRIPE_PRO_SCALE'),
    enterprise: jt('enterprise', 0,    0,    ''),
  },
  minutos: {
    starter:    jt('starter',    500,  20, 'STRIPE_MINUTOS_STARTER'),
    growth:     jt('growth',     900,  20, 'STRIPE_MINUTOS_GROWTH'),
    scale:      jt('scale',      1800, 20, 'STRIPE_MINUTOS_SCALE'),
    enterprise: jt('enterprise', 0,    0,  ''),
  },
  tareas: {
    starter:    jt('starter',    0, 500,  'STRIPE_TAREAS_STARTER'),
    growth:     jt('growth',     0, 1200, 'STRIPE_TAREAS_GROWTH'),
    scale:      jt('scale',      0, 3000, 'STRIPE_TAREAS_SCALE'),
    enterprise: jt('enterprise', 0, 0,    ''),
  },
};

// ─── Coordinadores (Nox/Niva): tareas-only, sin llamadas ────────────────────

export const NOX_JORNADA_CONFIG: Record<MinutesTier, JornadaTierConfig> = {
  starter:    { label: 'Media Jornada',    minutes: 0, aiOps:  500, mxn: TIER_PRICE_MXN.starter, priceId: () => process.env.STRIPE_NOX_STARTER! },
  growth:     { label: 'Jornada Completa', minutes: 0, aiOps: 1200, mxn: TIER_PRICE_MXN.growth,  priceId: () => process.env.STRIPE_NOX_GROWTH! },
  scale:      { label: 'Alta Demanda',     minutes: 0, aiOps: 3000, mxn: TIER_PRICE_MXN.scale,   priceId: () => process.env.STRIPE_NOX_SCALE! },
  enterprise: { label: 'Empresarial',      minutes: 0, aiOps:    0, mxn: 0,                       priceId: () => '' },
};

// ─── Lookup: priceId → (jornada, tier) ──────────────────────────────────────

export interface JornadaLookupResult {
  jornada:       JornadaType | 'coordinator';
  tier:          MinutesTier;
  cfg:           JornadaTierConfig;
  isCoordinator: boolean;
}

export function jornadaConfigFromPriceId(priceId: string): JornadaLookupResult | null {
  if (!priceId) return null;
  for (const [jornada, tiers] of Object.entries(JORNADA_CONFIG) as [JornadaType, Record<MinutesTier, JornadaTierConfig>][]) {
    for (const [tier, cfg] of Object.entries(tiers) as [MinutesTier, JornadaTierConfig][]) {
      if (cfg.priceId() === priceId) return { jornada, tier, cfg, isCoordinator: false };
    }
  }
  for (const [tier, cfg] of Object.entries(NOX_JORNADA_CONFIG) as [MinutesTier, JornadaTierConfig][]) {
    if (cfg.priceId() === priceId) return { jornada: 'coordinator', tier, cfg, isCoordinator: true };
  }
  return null;
}

// ─── Fecha de reset del pool ─────────────────────────────────────────────────

export function nextResetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

// ─── Resolver de asignación real ─────────────────────────────────────────────
// Devuelve la asignación real según el modelo del agente:
//   - coordinator (Nox/Niva) → NOX_JORNADA_CONFIG (tareas-only)
//   - resto                  → JORNADA_CONFIG[jornada_type ?? 'combinada']

export function resolveTierAllocation(
  jornadaType:   JornadaType | undefined,
  meerkatRoleId: string | undefined,
  tier:          MinutesTier,
): { minutes: number; aiOps: number } {
  const isCoordinator = meerkatRoleId === 'nox' || meerkatRoleId === 'niva';
  if (isCoordinator) {
    const cfg = NOX_JORNADA_CONFIG[tier];
    return { minutes: cfg.minutes, aiOps: cfg.aiOps };
  }
  const jornada = jornadaType ?? 'combinada';
  const alloc = JORNADA_CONFIG[jornada][tier];
  return { minutes: alloc.minutes, aiOps: alloc.aiOps };
}
