// Resync Nelia (Tortillería Estrella) contra Vapi para propagar la nueva tool
// registrar_cliente_nuevo + sucursal en registrar_incidencia.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

const AGENT_ID = 'e22fbc64-c01c-4184-8365-62e423052d7a';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { updateVapiAssistant } = await import('../src/lib/vapi/sync');

  const supabase = createAdminClient();
  const { data: agent, error } = await supabase.from('voice_agents')
    .select('*').eq('id', AGENT_ID).single();
  if (error || !agent) { console.error('Agent not found', error); process.exit(1); }
  if (!agent.vapi_agent_id) { console.error('Agent has no vapi_agent_id'); process.exit(1); }

  console.log('Resyncing Nelia:', {
    id: agent.id, name: agent.agent_name, vapi: agent.vapi_agent_id,
  });

  const ok = await updateVapiAssistant(agent.vapi_agent_id, agent);
  console.log('Vapi resync:', ok);
}

main().catch(err => { console.error(err); process.exit(1); });
