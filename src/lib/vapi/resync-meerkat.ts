import { createAdminClient } from '@/lib/supabase/admin';
import { updateVapiAssistant } from './sync';
import type { VoiceAgent } from '@/types/agent';

export async function resyncAgentsByMeerkat(
  meerkatId: string,
): Promise<{ synced: number; errors: number; agentIds: string[] }> {
  const supabase = createAdminClient();

  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('active', true)
    .filter('features->>meerkat_role_id', 'eq', meerkatId)
    .not('vapi_agent_id', 'is', null);

  if (error) {
    console.error('[resync-meerkat] fetch error', { meerkatId, error: error.message });
    return { synced: 0, errors: 1, agentIds: [] };
  }

  let synced = 0;
  let errors = 0;
  const agentIds: string[] = [];

  for (const agent of (agents ?? []) as VoiceAgent[]) {
    if (!agent.vapi_agent_id) continue;
    agentIds.push(agent.id);
    try {
      const ok = await updateVapiAssistant(agent.vapi_agent_id, agent);
      if (ok) synced++;
      else errors++;
    } catch (e) {
      console.error('[resync-meerkat] update failed', { agentId: agent.id, error: (e as Error).message });
      errors++;
    }
  }

  return { synced, errors, agentIds };
}
