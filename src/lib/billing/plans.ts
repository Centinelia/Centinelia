import type { Plan } from '@/types/agent';

export type { Plan };
export type MinutesTier = 'starter' | 'growth' | 'scale' | 'enterprise';
export type MinutesPlan = MinutesTier; // alias kept for DB field compatibility

// ─── Agent type (one-time setup fee) ─────────────────────────────────────────

export interface FeaturePlanConfig {
  label:       string;
  setupFee:    number;
  setupPriceId: () => string;
}

export const FEATURE_PLAN_CONFIG: Record<Plan, FeaturePlanConfig> = {
  comercial: { label: 'Comercial', setupFee: 8990,  setupPriceId: () => process.env.STRIPE_SETUP_COMERCIAL! },
  pro:       { label: 'Pro',       setupFee: 14990, setupPriceId: () => process.env.STRIPE_SETUP_PRO! },
};

// ─── Monthly plans (base platform fee + minutes, combined Stripe price) ───────
// Base: Comercial $200/mes · Pro $400/mes
// Minutes: $9.99 MXN/min in-plan · $12.99 MXN/min extra

export const PLAN_BASE_MXN: Record<Plan, number> = {
  comercial: 200,
  pro:       400,
};

export const MINUTES_RATE_IN_PLAN = 9.99;
export const MINUTES_RATE_EXTRA   = 12.99;

export interface MonthlyPlanConfig {
  label:     string;
  minutes:   number;
  mxn:       number; // total monthly (base + minutes)
  priceId:   () => string;
}

export const MONTHLY_CONFIG: Record<Plan, Record<MinutesTier, MonthlyPlanConfig>> = {
  comercial: {
    starter:    { label: 'Starter',    minutes: 300,  mxn: 3197,  priceId: () => process.env.STRIPE_COMERCIAL_STARTER! },
    growth:     { label: 'Growth',     minutes: 600,  mxn: 6194,  priceId: () => process.env.STRIPE_COMERCIAL_GROWTH! },
    scale:      { label: 'Scale',      minutes: 1200, mxn: 12188, priceId: () => process.env.STRIPE_COMERCIAL_SCALE! },
    enterprise: { label: 'Enterprise', minutes: 0,    mxn: 0,     priceId: () => '' },
  },
  pro: {
    starter:    { label: 'Starter',    minutes: 300,  mxn: 3397,  priceId: () => process.env.STRIPE_PRO_STARTER! },
    growth:     { label: 'Growth',     minutes: 600,  mxn: 6394,  priceId: () => process.env.STRIPE_PRO_GROWTH! },
    scale:      { label: 'Scale',      minutes: 1200, mxn: 12388, priceId: () => process.env.STRIPE_PRO_SCALE! },
    enterprise: { label: 'Enterprise', minutes: 0,    mxn: 0,     priceId: () => '' },
  },
};

// Flat tier config for display purposes (plan-agnostic: minutes count + label only)
export const MINUTES_TIER_CONFIG: Record<MinutesTier, { label: string; minutes: number }> = {
  starter:    { label: 'Starter',    minutes: 300 },
  growth:     { label: 'Growth',     minutes: 600 },
  scale:      { label: 'Scale',      minutes: 1200 },
  enterprise: { label: 'Enterprise', minutes: 0 },
};

/** @deprecated Use MONTHLY_CONFIG[plan][tier] for pricing, MINUTES_TIER_CONFIG for display */
export const MINUTES_PLAN_CONFIG = MINUTES_TIER_CONFIG as Record<MinutesTier, { label: string; minutes: number; mxn?: number; priceId?: () => string }>;

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

// ─── WhatsApp Messages Plans ──────────────────────────────────────────────────

export type WaMessagesPlan = 'wa_200' | 'wa_500' | 'wa_1000';

export interface WaMessagesPlanConfig {
  label:    string;
  messages: number;
  mxn:      number;
  priceId:  () => string;
}

export const WA_MESSAGES_PLAN_CONFIG: Record<WaMessagesPlan, WaMessagesPlanConfig> = {
  wa_200:  { label: 'WA Starter', messages: 200,  mxn: 249, priceId: () => process.env.STRIPE_WA_200! },
  wa_500:  { label: 'WA Growth',  messages: 500,  mxn: 449, priceId: () => process.env.STRIPE_WA_500! },
  wa_1000: { label: 'WA Scale',   messages: 1000, mxn: 749, priceId: () => process.env.STRIPE_WA_1000! },
};

export function waMsgsPlanFromPriceId(priceId: string): WaMessagesPlan | null {
  for (const [plan, cfg] of Object.entries(WA_MESSAGES_PLAN_CONFIG) as [WaMessagesPlan, WaMessagesPlanConfig][]) {
    if (cfg.priceId() === priceId) return plan;
  }
  return null;
}
