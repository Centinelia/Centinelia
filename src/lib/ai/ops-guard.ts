import { createAdminClient } from '@/lib/supabase/admin';
import { executeAutoRefillOps } from '@/lib/billing/auto-refill';

export interface OpsResult {
  ok:    boolean;
  used:  number;
  limit: number;
}

// Atomically checks and consumes AI ops from the account pool.
// Delegates to the consume_ai_ops Postgres function which holds a FOR UPDATE
// lock on all sibling agent rows, preventing concurrent over-consumption.
export async function consumeAiOp(agentId: string, count = 1): Promise<OpsResult> {
  const supabase = createAdminClient();

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
