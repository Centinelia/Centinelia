// Descuento del pool compartido de minutos/ops cuando billing_model='annual_prepaid'.
// Encapsula la lógica de branching stripe vs annual para que voice/webhook y
// executor no dupliquen el guard.

import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { annualContractOverageAlertHtml } from '@/lib/email/annual-contracts';
import type { AnnualContract, BillingModel } from '@/types/annual-contract';

const ADMIN_MAIL = 'hola@centinelia.mx';

// Envía el correo E4 (interno) cuando el pool cruzó 100% o 120%. Fire and
// forget: no bloquea la llamada/tool que lo disparó.
export async function fireOverageAlertIfNeeded(
  portalEmail: string,
  result: { crossed_100_threshold?: boolean; crossed_120_threshold?: boolean },
): Promise<void> {
  const threshold: '100' | '120' | null = result.crossed_120_threshold ? '120' : result.crossed_100_threshold ? '100' : null;
  if (!threshold) return;

  const supabase = createAdminClient();
  const { data: org } = await supabase.from('organizations')
    .select('name, active_contract_id, monthly_minutes_used, monthly_ops_used, pool_reset_date')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (!org?.active_contract_id) return;

  const { data: contract } = await supabase.from('annual_contracts')
    .select('*')
    .eq('id', org.active_contract_id)
    .maybeSingle();
  if (!contract) return;

  const resetISO = (org.pool_reset_date as string | null) ?? '';
  const daysRemaining = resetISO
    ? Math.max(0, Math.round((new Date(resetISO + 'T00:00:00Z').getTime() - Date.now()) / 86_400_000))
    : 0;

  const html = annualContractOverageAlertHtml({
    businessName:       (org.name as string | null) ?? portalEmail,
    contract:           contract as AnnualContract,
    minutesUsed:        (org.monthly_minutes_used as number) ?? 0,
    opsUsed:            (org.monthly_ops_used as number) ?? 0,
    daysRemainingCycle: daysRemaining,
    threshold,
  });

  const label = threshold === '120' ? 'Overage 20% arriba' : 'Pool al límite';
  await sendEmail({
    to:      ADMIN_MAIL,
    subject: `[${label}] ${(org.name as string | null) ?? portalEmail} · ${(contract.contract_folio as string)}`,
    html,
  }).catch(err => console.error('[pool-consume] overage alert failed:', err));
}

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

  // Check feature flag
  const { data: orgFlag } = await sb
    .from('organizations')
    .select('ops_ledger_enabled, billing_model')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const ledgerEnabled = !!orgFlag?.ops_ledger_enabled;
  const model = (orgFlag?.billing_model as BillingModel) ?? 'stripe';

  // NEW path: ledger event-sourced (aplica tanto a stripe como annual)
  if (ledgerEnabled) {
    // Solo annual pasa por consumePoolOps hoy — para stripe consumeAiOp llama consume_pool_ops directo
    if (model !== 'annual_prepaid') {
      return { consumed: false, billing_model: model === 'expired' ? 'expired' : 'stripe' };
    }

    const { data: newBalance } = await sb.rpc('consume_pool_ops', {
      p_portal_email: portalEmail,
      p_agent_id:     null,
      p_ops:          ops,
      p_reference_id: null,
      p_description:  null,
    });

    const { data: acct } = await sb
      .from('account_ops')
      .select('ops_used, ops_included')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const { data: org } = await sb
      .from('organizations')
      .select('overage_ops')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const pool = acct?.ops_included ?? 0;
    const used = acct?.ops_used ?? 0;
    const overage = (org?.overage_ops as number) ?? 0;
    const pctPrev = pool > 0 ? ((used - ops) / pool) * 100 : 0;
    const pctNext = pool > 0 ? (used / pool) * 100 : 0;

    return {
      consumed:              true,
      billing_model:         'annual_prepaid',
      minutes_used_after:    used,
      minutes_pool:          pool,
      overage_after:         overage,
      crossed_100_threshold: pctPrev < 100 && pctNext >= 100,
      crossed_120_threshold: pctPrev < 120 && pctNext >= 120,
    };
  }

  // LEGACY path: código actual sin cambios
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
