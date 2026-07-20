import { createAdminClient } from '@/lib/supabase/admin';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

export type LearningSource = 'call' | 'email' | 'chat';

// Learnings above this confidence threshold get auto-approved without owner review.
const AUTO_APPROVE_THRESHOLD = 0.85;

export async function saveLearning(opts: {
  agentId:     string;
  portalEmail: string | null;
  content:     string;
  source?:     LearningSource;
  confidence?: number; // 0–1
  vapiCallId?: string | null;
  category?:   'role_kb' | 'guardrails';
}): Promise<void> {
  const {
    agentId,
    portalEmail,
    content,
    source      = 'call',
    confidence  = undefined,
    vapiCallId  = null,
    category    = 'role_kb',
  } = opts;

  const supabase     = createAdminClient();
  const autoApprove  = (confidence ?? 0) >= AUTO_APPROVE_THRESHOLD;
  const now          = new Date().toISOString();

  const row = {
    agent_id:     agentId,
    portal_email: portalEmail,
    vapi_call_id: vapiCallId,
    content:      content.trim().slice(0, 500),
    confidence:   confidence ?? null,
    category,
    source,
    status:       autoApprove ? 'approved' : 'pending',
    ...(autoApprove ? { approved_at: now } : {}),
  };

  await supabase.from('agent_learnings').insert(row);

  // Auto-approve path: immediately incorporate into the correct field + sync to Vapi
  if (autoApprove) {
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agent) {
      const field      = category === 'guardrails' ? 'guardrails_learnings' : 'role_learnings';
      const existing   = ((agent as any)[field] as string | null) ?? '';
      const separator  = existing.trim() ? '\n\n' : '';
      const updated    = `${existing}${separator}• ${content.trim()}`;

      await Promise.all([
        supabase
          .from('voice_agents')
          .update({ [field]: updated })
          .eq('id', agentId),
        portalEmail
          ? supabase.from('agent_messages').insert({
              portal_email:  portalEmail,
              from_agent_id: agentId,
              to_agent_id:   null,
              type:          'learning',
              content:       content.trim(),
              metadata:      { source, auto_approved: true, category },
            })
          : Promise.resolve(),
      ]);

      if ((agent as any).vapi_agent_id) {
        updateVapiAssistant(
          (agent as any).vapi_agent_id,
          { ...agent, [field]: updated } as VoiceAgent,
        ).catch(console.error);
      }
    }
  }
}

/**
 * Save multiple learnings at once (e.g., from email/chat batch extraction).
 * Skips if agent already has ≥10 pending learnings.
 */
export async function saveLearnings(
  items: Array<Omit<Parameters<typeof saveLearning>[0], never>>,
): Promise<number> {
  if (!items.length) return 0;
  const supabase = createAdminClient();

  // Pending flood guard — same agent for all items is assumed
  const agentId = items[0].agentId;
  const { count } = await supabase
    .from('agent_learnings')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('status', 'pending');
  if ((count ?? 0) >= 10) return 0;

  let saved = 0;
  for (const item of items) {
    await saveLearning(item).catch(console.error);
    saved++;
  }
  return saved;
}
