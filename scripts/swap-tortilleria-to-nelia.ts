import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const PORTAL_EMAIL = 'servicioalcliente@tortillaestrella.com.mx';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { MEERKAT_MAP } = await import('../src/lib/portal/meerkat-roles');
  const { updateVapiAssistant } = await import('../src/lib/vapi/sync');

  const supabase = createAdminClient();
  const { data: agent, error } = await supabase.from('voice_agents')
    .select('*').eq('id', AGENT_ID).single();
  if (error || !agent) { console.error('Agent not found', error); process.exit(1); }

  const nelia = MEERKAT_MAP['nelia'];
  const newFeatures = { ...(agent.features ?? {}), meerkat_role_id: 'nelia' };

  const { data: updated } = await supabase.from('voice_agents')
    .update({
      features:            newFeatures,
      elevenlabs_voice_id: nelia.voiceId,
      agent_name:          'Nelia',
    })
    .eq('id', AGENT_ID).select('*').single();

  console.log('Updated agent row:', {
    id: updated.id, agent_name: updated.agent_name,
    meerkat: updated.features.meerkat_role_id, voice: updated.elevenlabs_voice_id,
  });

  if (updated.vapi_agent_id) {
    const ok = await updateVapiAssistant(updated.vapi_agent_id, updated);
    console.log('Vapi resync:', ok);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
