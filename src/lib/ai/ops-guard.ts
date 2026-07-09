import { createAdminClient } from '@/lib/supabase/admin';

export interface OpsResult {
  ok:    boolean;
  used:  number;
  limit: number;
}

// Checks and atomically increments the AI ops counter for an account.
// Call before any non-call AI operation (email processing, doc analysis, etc.).
// Returns ok:false if the monthly limit is reached — the caller must abort.
export async function consumeAiOp(portalEmail: string): Promise<OpsResult> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, ai_ops_used, ai_ops_limit')
    .eq('portal_email', portalEmail)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!agent) return { ok: false, used: 0, limit: 0 };

  const used  = agent.ai_ops_used  ?? 0;
  const limit = agent.ai_ops_limit ?? 100;

  if (used >= limit) return { ok: false, used, limit };

  await supabase
    .from('voice_agents')
    .update({ ai_ops_used: used + 1 })
    .eq('id', agent.id);

  return { ok: true, used: used + 1, limit };
}

// Resets ops counter for all agents in the account. Called on monthly renewal.
export async function resetAiOps(portalEmail: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('voice_agents')
    .update({ ai_ops_used: 0 })
    .eq('portal_email', portalEmail);
}

// Sets the ops limit for all agents in the account. Called on plan change.
export async function setAiOpsLimit(portalEmail: string, limit: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('voice_agents')
    .update({ ai_ops_limit: limit })
    .eq('portal_email', portalEmail);
}
