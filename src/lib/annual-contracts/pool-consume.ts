// Descuento del pool compartido de minutos/ops cuando billing_model='annual_prepaid'.
// Encapsula la lógica de branching stripe vs annual para que voice/webhook y
// executor no dupliquen el guard.

import { createAdminClient } from '@/lib/supabase/admin';
import type { BillingModel } from '@/types/annual-contract';

type Supabase = ReturnType<typeof createAdminClient>;

export interface OrgConsumptionSnapshot {
  billing_model:        BillingModel;
  active_contract_id:   string | null;
  monthly_minutes_pool: number;   // 0 si stripe
  monthly_ops_pool:     number;
  monthly_minutes_used: number;
  monthly_ops_used:     number;
  overage_minutes:      number;
  overage_ops:          number;
  pool_reset_date:      string | null;
}

// Lee el snapshot del pool para una org. Devuelve null si la org no existe o
// no está en annual_prepaid (caller usa el path Stripe legacy).
export async function getPoolSnapshot(
  portalEmail: string,
  supabase?: Supabase,
): Promise<OrgConsumptionSnapshot | null> {
  const sb = supabase ?? createAdminClient();

  const { data: org } = await sb
    .from('organizations')
    .select('billing_model, active_contract_id, monthly_minutes_used, monthly_ops_used, overage_minutes, overage_ops, pool_reset_date')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  if (!org) return null;
  const model = (org.billing_model as BillingModel) ?? 'stripe';
  if (model !== 'annual_prepaid') return null;

  const contractId = org.active_contract_id as string | null;
  let poolMinutes = 0;
  let poolOps = 0;
  if (contractId) {
    const { data: contract } = await sb
      .from('annual_contracts')
      .select('monthly_minutes_pool, monthly_ops_pool')
      .eq('id', contractId)
      .maybeSingle();
    poolMinutes = (contract?.monthly_minutes_pool as number) ?? 0;
    poolOps     = (contract?.monthly_ops_pool as number) ?? 0;
  }

  return {
    billing_model:        model,
    active_contract_id:   contractId,
    monthly_minutes_pool: poolMinutes,
    monthly_ops_pool:     poolOps,
    monthly_minutes_used: (org.monthly_minutes_used as number) ?? 0,
    monthly_ops_used:     (org.monthly_ops_used as number)     ?? 0,
    overage_minutes:      (org.overage_minutes as number)      ?? 0,
    overage_ops:          (org.overage_ops as number)          ?? 0,
    pool_reset_date:      (org.pool_reset_date as string | null) ?? null,
  };
}

export interface PoolConsumeResult {
  consumed:               true;
  billing_model:          'annual_prepaid';
  minutes_used_after:     number;
  minutes_pool:           number;
  overage_after:          number;
  crossed_100_threshold:  boolean;
  crossed_120_threshold:  boolean;
}

export interface PoolPassthroughResult {
  consumed: false;                  // caller usa el path Stripe legacy
  billing_model: 'stripe' | 'expired';
}

// Descuenta N minutos del pool de la org. Retorna consumed=false si la org
// no está en annual_prepaid (caller sigue con path Stripe). Si consumed=true,
// caller NO debe descontar del voice_agent (ya se descontó del pool).
export async function consumePoolMinutes(
  portalEmail: string,
  minutes: number,
  supabase?: Supabase,
): Promise<PoolConsumeResult | PoolPassthroughResult> {
  const sb = supabase ?? createAdminClient();
  const snap = await getPoolSnapshot(portalEmail, sb);
  if (!snap) {
    // Chequea si el modelo es expired (aún así no aplica pool)
    const { data: org } = await sb
      .from('organizations')
      .select('billing_model')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    return { consumed: false, billing_model: ((org?.billing_model as BillingModel) ?? 'stripe') === 'expired' ? 'expired' : 'stripe' };
  }

  const prev  = snap.monthly_minutes_used;
  const next  = prev + minutes;
  const pool  = snap.monthly_minutes_pool;

  // Overage acumulado: sólo lo que exceda del pool contribuye al overage.
  const prevOverBy   = Math.max(0, prev  - pool);
  const nextOverBy   = Math.max(0, next  - pool);
  const overageDelta = nextOverBy - prevOverBy;

  const newOverage = snap.overage_minutes + overageDelta;

  await sb.from('organizations')
    .update({
      monthly_minutes_used: next,
      overage_minutes:      newOverage,
    })
    .eq('portal_email', portalEmail);

  const pctPrev = pool > 0 ? (prev / pool) * 100 : 0;
  const pctNext = pool > 0 ? (next / pool) * 100 : 0;

  return {
    consumed:              true,
    billing_model:         'annual_prepaid',
    minutes_used_after:    next,
    minutes_pool:          pool,
    overage_after:         newOverage,
    crossed_100_threshold: pctPrev < 100 && pctNext >= 100,
    crossed_120_threshold: pctPrev < 120 && pctNext >= 120,
  };
}

// Descuento equivalente para ops (tools/tareas). Misma semántica.
export async function consumePoolOps(
  portalEmail: string,
  ops: number,
  supabase?: Supabase,
): Promise<PoolConsumeResult | PoolPassthroughResult> {
  const sb = supabase ?? createAdminClient();
  const snap = await getPoolSnapshot(portalEmail, sb);
  if (!snap) {
    const { data: org } = await sb
      .from('organizations')
      .select('billing_model')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    return { consumed: false, billing_model: ((org?.billing_model as BillingModel) ?? 'stripe') === 'expired' ? 'expired' : 'stripe' };
  }

  const prev = snap.monthly_ops_used;
  const next = prev + ops;
  const pool = snap.monthly_ops_pool;
  const prevOverBy = Math.max(0, prev - pool);
  const nextOverBy = Math.max(0, next - pool);
  const overageDelta = nextOverBy - prevOverBy;
  const newOverage = snap.overage_ops + overageDelta;

  await sb.from('organizations')
    .update({
      monthly_ops_used: next,
      overage_ops:      newOverage,
    })
    .eq('portal_email', portalEmail);

  const pctPrev = pool > 0 ? (prev / pool) * 100 : 0;
  const pctNext = pool > 0 ? (next / pool) * 100 : 0;

  return {
    consumed:              true,
    billing_model:         'annual_prepaid',
    minutes_used_after:    next,     // reusamos el nombre por comodidad
    minutes_pool:          pool,
    overage_after:         newOverage,
    crossed_100_threshold: pctPrev < 100 && pctNext >= 100,
    crossed_120_threshold: pctPrev < 120 && pctNext >= 120,
  };
}
