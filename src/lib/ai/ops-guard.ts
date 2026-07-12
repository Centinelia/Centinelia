import { createAdminClient } from '@/lib/supabase/admin';

export interface OpsResult {
  ok:    boolean;
  used:  number;
  limit: number;
}

// Checks and atomically increments the AI ops counter for an account pool.
// Call before any non-call AI operation (email processing, doc analysis, etc.).
// Pass the specific agent doing the work — pool total is derived from the whole account.
// Returns ok:false if the monthly pool limit is reached — the caller must abort.
export async function consumeAiOp(agentId: string, count = 1): Promise<OpsResult> {
  const supabase = createAdminClient();

  // Fetch the acting agent + its account's portal_email
  const { data: actor } = await supabase
    .from('voice_agents')
    .select('id, portal_email, ai_ops_used, ai_ops_limit')
    .eq('id', agentId)
    .single();

  if (!actor?.portal_email) return { ok: false, used: 0, limit: 0 };

  // Account-level pool: sum all agents in the same account
  const { data: siblings } = await supabase
    .from('voice_agents')
    .select('ai_ops_used, ai_ops_limit')
    .eq('portal_email', actor.portal_email);

  const totalUsed  = (siblings ?? []).reduce((s, a) => s + ((a.ai_ops_used  as number) ?? 0), 0);
  const totalLimit = (siblings ?? []).reduce((s, a) => s + ((a.ai_ops_limit as number) ?? 0), 0);

  if (totalLimit === 0 || totalUsed + count > totalLimit) {
    return { ok: false, used: totalUsed, limit: totalLimit };
  }

  // Increment this specific agent's counter
  await supabase
    .from('voice_agents')
    .update({ ai_ops_used: ((actor.ai_ops_used as number) ?? 0) + count })
    .eq('id', agentId);

  // Log for historical ranking queries
  supabase.from('ai_ops_log').insert({ agent_id: agentId, portal_email: actor.portal_email }).then(() => {});

  return { ok: true, used: totalUsed + count, limit: totalLimit };
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
