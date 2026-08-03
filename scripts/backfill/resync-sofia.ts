/**
 * Resync targeted: solo Sofia (studio@pneumastudio.mx).
 * Aplica el firstMessage nuevo del sync.ts a su assistant en Vapi.
 * NO toca otros agentes.
 */
import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateVapiAssistant } from '@/lib/vapi/sync';
import type { VoiceAgent } from '@/types/agent';

async function main() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .eq('agent_name', 'Sofía');
  if (error) { console.error(error); process.exit(1); }
  const sofia = data?.[0];
  if (!sofia) { console.error('No Sofia found'); process.exit(1); }
  if (!sofia.vapi_agent_id) { console.error('Sofia has no vapi_agent_id'); process.exit(1); }

  console.log(`Resyncing Sofia (vapi_agent_id=${sofia.vapi_agent_id})...`);
  const ok = await updateVapiAssistant(sofia.vapi_agent_id, sofia as VoiceAgent);
  console.log(ok ? 'OK' : 'FAILED');
}
main().catch(e => { console.error(e); process.exit(1); });
