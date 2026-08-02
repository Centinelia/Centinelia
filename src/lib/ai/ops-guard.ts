import { createAdminClient } from '@/lib/supabase/admin';
import { executeAutoRefillOps } from '@/lib/billing/auto-refill';
import { consumePoolOps, fireOverageAlertIfNeeded } from '@/lib/annual-contracts/pool-consume';

export interface OpsResult {
  ok:    boolean;
  used:  number;
  limit: number;
}

// Atomically checks and consumes AI ops from the account pool.
// 3 paths:
//   (a) annual_prepaid: descuenta del pool en organizations (nunca falla, tracks overage).
//   (b) stripe con portal_email: consume_ai_ops RPC con FOR UPDATE lock.
//   (c) stripe standalone: mismo RPC, account_email=null.
export async function consumeAiOp(agentId: string, count = 1): Promise<OpsResult> {
  const supabase = createAdminClient();

  // Path (a): pool anual. Resolve org email primero, luego branch.
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agentId)
    .maybeSingle();
  const portalEmail = (agentRow?.portal_email as string | null) ?? null;

  if (portalEmail) {
    const pool = await consumePoolOps(portalEmail, count, supabase);
    if (pool.consumed) {
      // E4: overage alert interno (fire and forget)
      void fireOverageAlertIfNeeded(portalEmail, {
        crossed_100_threshold: pool.crossed_100_threshold,
        crossed_120_threshold: pool.crossed_120_threshold,
      });
      return { ok: true, used: pool.minutes_used_after, limit: pool.minutes_pool };
    }
  }

  // Path (b) y (c): Stripe legacy.
  const { data, error } = await supabase
    .rpc('consume_ai_ops', { p_agent_id: agentId, p_count: count })
    .single();

  if (error || !data) return { ok: false, used: 0, limit: 0 };

  const row = data as { ok: boolean; ops_used: number; ops_limit: number; account_email: string | null };

  if (row.ok && row.account_email) {
    // Fire-and-forget audit log
    void supabase
      .from('ai_ops_log')
      .insert({ agent_id: agentId, portal_email: row.account_email });

    // Fire-and-forget ops auto-refill: trigger when remaining just dropped below threshold
    const remaining = row.ops_limit - row.ops_used;
    const prevRemaining = remaining + count;
    void (async () => {
      const { data: cfg } = await supabase
        .from('voice_agents')
        .select('auto_refill_ops_enabled, auto_refill_ops_threshold, stripe_customer_id')
        .eq('id', agentId)
        .single();
      const threshold = (cfg?.auto_refill_ops_threshold as number) ?? 50;
      if (cfg?.auto_refill_ops_enabled && cfg?.stripe_customer_id && prevRemaining >= threshold && remaining < threshold) {
        await executeAutoRefillOps(agentId).catch(() => null);
      }
    })();
  }

  return { ok: row.ok, used: row.ops_used, limit: row.ops_limit };
}

// Resets ops counter for all agents in the account. Called on monthly renewal.
export async function resetAiOps(portalEmail: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('voice_agents')
    .update({ ai_ops_used: 0 })
    .eq('portal_email', portalEmail);
}

// Sets the per-agent ops limit for all agents in the account. Called on plan change.
// Pool total = limit × number of agents.
export async function setAiOpsLimit(portalEmail: string, limitPerAgent: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('voice_agents')
    .update({ ai_ops_limit: limitPerAgent })
    .eq('portal_email', portalEmail);
}
