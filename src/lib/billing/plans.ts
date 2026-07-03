import type { Plan } from '@/types/agent';

export type MinutesPlan = 'starter' | 'growth' | 'scale' | 'enterprise';

export interface FeaturePlanConfig {
  label: string;
  setupFee: number;
  setupPriceId: () => string;
}

export interface MinutesPlanConfig {
  label: string;
  minutes: number;
  mxn: number;
  priceId: () => string;
}

export const FEATURE_PLAN_CONFIG: Record<Plan, FeaturePlanConfig> = {
  basico:   { label: 'Recepcionista', setupFee: 4990,  setupPriceId: () => process.env.STRIPE_SETUP_BASICO! },
  estandar: { label: 'Comercial',     setupFee: 7990,  setupPriceId: () => process.env.STRIPE_SETUP_ESTANDAR! },
  pro:      { label: 'Pro',           setupFee: 12990, setupPriceId: () => process.env.STRIPE_SETUP_PRO! },
};

export const MINUTES_PLAN_CONFIG: Record<MinutesPlan, MinutesPlanConfig> = {
  starter:    { label: 'Starter',    minutes: 200,  mxn: 1990,  priceId: () => process.env.STRIPE_MINUTES_STARTER! },
  growth:     { label: 'Growth',     minutes: 500,  mxn: 3490,  priceId: () => process.env.STRIPE_MINUTES_GROWTH! },
  scale:      { label: 'Scale',      minutes: 1000, mxn: 6490,  priceId: () => process.env.STRIPE_MINUTES_SCALE! },
  enterprise: { label: 'Enterprise', minutes: 3000, mxn: 12990, priceId: () => process.env.STRIPE_MINUTES_ENTERPRISE! },
};

export function minutesPlanFromPriceId(priceId: string): MinutesPlan | null {
  for (const [plan, cfg] of Object.entries(MINUTES_PLAN_CONFIG) as [MinutesPlan, MinutesPlanConfig][]) {
    if (cfg.priceId() === priceId) return plan;
  }
  return null;
}

export function nextResetDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

// ─── WhatsApp Messages Plans ──────────────────────────────────────────────────

export type WaMessagesPlan = 'wa_200' | 'wa_500' | 'wa_1000';

export interface WaMessagesPlanConfig {
  label: string;
  messages: number;
  mxn: number;
  priceId: () => string;
}

export const WA_MESSAGES_PLAN_CONFIG: Record<WaMessagesPlan, WaMessagesPlanConfig> = {
  wa_200:  { label: 'WA Starter', messages: 200,  mxn: 249,  priceId: () => process.env.STRIPE_WA_200! },
  wa_500:  { label: 'WA Growth',  messages: 500,  mxn: 449,  priceId: () => process.env.STRIPE_WA_500! },
  wa_1000: { label: 'WA Scale',   messages: 1000, mxn: 749,  priceId: () => process.env.STRIPE_WA_1000! },
};

export function waMsgsPlanFromPriceId(priceId: string): WaMessagesPlan | null {
  for (const [plan, cfg] of Object.entries(WA_MESSAGES_PLAN_CONFIG) as [WaMessagesPlan, WaMessagesPlanConfig][]) {
    if (cfg.priceId() === priceId) return plan;
  }
  return null;
}
