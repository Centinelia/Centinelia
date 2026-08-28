import type { Plan, JornadaType } from '@/types/agent';

export type { Plan };
export type MinutesTier = 'starter' | 'growth' | 'scale' | 'enterprise';
export type MinutesPlan = MinutesTier; // alias kept for DB field compatibility

// ─── Agent type (one-time setup fee) ─────────────────────────────────────────

export interface FeaturePlanConfig {
  label:       string;
  setupFee:    number;
  aiOpsLimit:  number;
  setupPriceId: () => string;
}

export const FEATURE_PLAN_CONFIG: Record<Plan, FeaturePlanConfig> = {
  pro:       { label: 'Empleado Centinelia', setupFee: 14990, aiOpsLimit: 300, setupPriceId: () => process.env.STRIPE_SETUP_PRO! },
};

// ─── Monthly plans (minutes only + IVA, no platform base fee) ────────────────
// Minutes in-plan efectivos (jornada / min incluido): 300min $2,997 = $9.99/min.
// Minutos extra (compra puntual + auto-refill): $12/min pre-IVA — este es el
// precio que el cliente ve y paga en BuyMinutesSection / AutoRefillSection /
// api/portal/buy-minutes. IVA 16% aparte. NO cambiar sin sincronizar los 3.

export const PLAN_BASE_MXN: Record<Plan, number> = {
  pro:       0,
};

export const MINUTES_RATE_IN_PLAN = 9.99;
export const MINUTES_RATE_EXTRA   = 12;

export interface MonthlyPlanConfig {
  label:     string;
  minutes:   number;
  aiOps:     number;
  mxn:       number; // total monthly (base + minutes)
  priceId:   () => string;
}

export const MONTHLY_CONFIG: Record<Plan, Record<MinutesTier, MonthlyPlanConfig>> = {
  pro: {
    starter:    { label: 'Esencial',    minutes: 300,  aiOps: 100, mxn: 2997,  priceId: () => process.env.STRIPE_PRO_STARTER! },
    growth:     { label: 'Profesional', minutes: 600,  aiOps: 200, mxn: 5994,  priceId: () => process.env.STRIPE_PRO_GROWTH! },
    scale:      { label: 'Avanzado',    minutes: 1200, aiOps: 300, mxn: 11988, priceId: () => process.env.STRIPE_PRO_SCALE! },
    enterprise: { label: 'Empresarial', minutes: 0,    aiOps:   0, mxn: 0,     priceId: () => '' },
  },
};

// Flat tier config for display purposes (plan-agnostic: minutes count + label only)
export const MINUTES_TIER_CONFIG: Record<MinutesTier, { label: string; minutes: number }> = {
  starter:    { label: 'Esencial',    minutes: 300 },
  growth:     { label: 'Profesional', minutes: 600 },
  scale:      { label: 'Avanzado',    minutes: 1200 },
  enterprise: { label: 'Empresarial', minutes: 0 },
};

/** @deprecated Use MONTHLY_CONFIG[plan][tier] for pricing, MINUTES_TIER_CONFIG for display */
export const MINUTES_PLAN_CONFIG = MINUTES_TIER_CONFIG as Record<MinutesTier, { label: string; minutes: number; mxn?: number; priceId?: () => string }>;

// ─── Jornada resource allocations (same price, different mix) ─────────────────
// Coordinators (Nox/Niva) use NOX_MONTHLY_CONFIG instead, not JORNADA_CONFIG.

export interface JornadaAllocation {
  minutes: number;
  aiOps:   number;
}

export const JORNADA_CONFIG: Record<JornadaType, Record<MinutesTier, JornadaAllocation>> = {
  combinada: {
    starter:    { minutes: 300,  aiOps: 320 },
    growth:     { minutes: 600,  aiOps: 420 },
    scale:      { minutes: 1200, aiOps: 520 },
    enterprise: { minutes: 0,    aiOps: 0   },
  },
  minutos: {
    starter:    { minutes: 500,  aiOps: 20 },
    growth:     { minutes: 1000, aiOps: 20 },
    scale:      { minutes: 2000, aiOps: 20 },
    enterprise: { minutes: 0,    aiOps: 0  },
  },
  tareas: {
    starter:    { minutes: 0, aiOps: 500  },
    growth:     { minutes: 0, aiOps: 1200 },
    scale:      { minutes: 0, aiOps: 3000 },
    enterprise: { minutes: 0, aiOps: 0    },
  },
};

// ─── Nox coordinator tiers (ops-only, no Vapi/minutes cost) ─────────────────
// 500 ops/$2,997 · 1,200 ops/$5,994 · 3,000 ops/$11,988 (+ IVA)
// Requires STRIPE_NOX_STARTER, STRIPE_NOX_GROWTH, STRIPE_NOX_SCALE price IDs
export const NOX_MONTHLY_CONFIG: Record<MinutesTier, MonthlyPlanConfig> = {
  starter:    { label: 'Media Jornada',    minutes: 0, aiOps:  500, mxn: 2997,  priceId: () => process.env.STRIPE_NOX_STARTER! },
  growth:     { label: 'Jornada Completa', minutes: 0, aiOps: 1200, mxn: 5994,  priceId: () => process.env.STRIPE_NOX_GROWTH! },
  scale:      { label: 'Alta Demanda',     minutes: 0, aiOps: 3000, mxn: 11988, priceId: () => process.env.STRIPE_NOX_SCALE! },
  enterprise: { label: 'Empresarial',      minutes: 0, aiOps:    0, mxn: 0,     priceId: () => '' },
};

export function monthlyConfigFromPriceId(priceId: string): { plan: Plan; tier: MinutesTier; cfg: MonthlyPlanConfig; isCoordinator: boolean } | null {
  for (const [plan, tiers] of Object.entries(MONTHLY_CONFIG) as [Plan, Record<MinutesTier, MonthlyPlanConfig>][]) {
    for (const [tier, cfg] of Object.entries(tiers) as [MinutesTier, MonthlyPlanConfig][]) {
      if (cfg.priceId && cfg.priceId() === priceId) return { plan, tier, cfg, isCoordinator: false };
    }
  }
  // Nox/Niva coordinators: sus price IDs (STRIPE_NOX_*) NO estaban aquí — resultado:
  // invoice.payment_succeeded llegaba con price=STRIPE_NOX_STARTER, retornaba null,
  // break → resetAiOps NO se ejecutaba → cliente Nox pagaba $2,997/mes y no recibía
  // tareas después del primer mes. Ver Scope D1 CRIT-1.
  for (const [tier, cfg] of Object.entries(NOX_MONTHLY_CONFIG) as [MinutesTier, MonthlyPlanConfig][]) {
    if (cfg.priceId && cfg.priceId() === priceId) return { plan: 'pro', tier, cfg, isCoordinator: true };
  }
  return null;
}

/** @deprecated Use monthlyConfigFromPriceId */
export function minutesPlanFromPriceId(priceId: string): MinutesTier | null {
  return monthlyConfigFromPriceId(priceId)?.tier ?? null;
}

export function nextResetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

// ─── Resolver de asignación real (source of truth por agente) ────────────────
// Un cliente en jornada `tareas` que compra tier growth recibe 1200 tareas,
// no 200 como decía MONTHLY_CONFIG.pro (que está stale post-refactor jornadas).
// Este helper devuelve la asignación real según el modelo del agente:
//   - coordinator (Nox/Niva) → NOX_MONTHLY_CONFIG (tareas-only)
//   - resto                  → JORNADA_CONFIG[jornada_type ?? 'combinada']
// Usar SIEMPRE este helper en change-plan, billing/webhook plan_upgrade,
// UpgradePlanSection, y cualquier código que necesite {minutes, aiOps} de
// un tier específico. Nunca leer MONTHLY_CONFIG[plan][tier].aiOps directo.
export function resolveTierAllocation(
  jornadaType:   'combinada' | 'minutos' | 'tareas' | undefined,
  meerkatRoleId: string | undefined,
  tier:          MinutesTier,
): { minutes: number; aiOps: number } {
  const isCoordinator = meerkatRoleId === 'nox' || meerkatRoleId === 'niva';
  if (isCoordinator) {
    const cfg = NOX_MONTHLY_CONFIG[tier];
    return { minutes: cfg.minutes, aiOps: cfg.aiOps };
  }
  const jornada = jornadaType ?? 'combinada';
  const alloc = JORNADA_CONFIG[jornada][tier];
  return { minutes: alloc.minutes, aiOps: alloc.aiOps };
}

