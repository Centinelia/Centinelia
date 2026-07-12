import { createAdminClient } from '@/lib/supabase/admin';

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

  // Fire-and-forget audit log (only on successful consumption)
  if (row.ok && row.account_email) {
    void supabase
      .from('ai_ops_log')
      .insert({ agent_id: agentId, portal_email: row.account_email });
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
