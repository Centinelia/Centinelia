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
// Minutes: $9.99 MXN/min in-plan · $12.99 MXN/min extra · +16% IVA on total
// Starter 300min = $2,997 | Growth 600min = $5,994 | Scale 1,200min = $11,988

export const PLAN_BASE_MXN: Record<Plan, number> = {
  pro:       0,
};

export const MINUTES_RATE_IN_PLAN = 9.99;
export const MINUTES_RATE_EXTRA   = 12.99;

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
    starter:    { minutes: 300,  aiOps: 120 },
    growth:     { minutes: 600,  aiOps: 220 },
    scale:      { minutes: 1200, aiOps: 320 },
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

export function monthlyConfigFromPriceId(priceId: string): { plan: Plan; tier: MinutesTier; cfg: MonthlyPlanConfig } | null {
  for (const [plan, tiers] of Object.entries(MONTHLY_CONFIG) as [Plan, Record<MinutesTier, MonthlyPlanConfig>][]) {
    for (const [tier, cfg] of Object.entries(tiers) as [MinutesTier, MonthlyPlanConfig][]) {
      if (cfg.priceId && cfg.priceId() === priceId) return { plan, tier, cfg };
    }
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

