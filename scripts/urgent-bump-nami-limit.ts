/**
 * URGENTE: el portal lee voice_agents.ai_ops_limit/ai_ops_used.
 * Account_ops.ops_balance (que recargué) NO afecta la UI.
 * Bump ai_ops_limit para que Camila vea tareas disponibles en vivo.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const PORTAL_EMAIL = 'camila@acproyectos.com';

async function main() {
  const { data: before } = await sb
    .from('voice_agents')
    .select('id, agent_name, ai_ops_used, ai_ops_limit, active')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('BEFORE:', before);

  // Bump limit so that (limit - used) >= 500 ops disponibles
  for (const a of before ?? []) {
    const agent = a as any;
    const current_used  = Number(agent.ai_ops_used)  || 0;
    const new_limit     = current_used + 500;        // deja 500 tareas visibles
    const { error } = await sb
      .from('voice_agents')
      .update({ ai_ops_limit: new_limit })
      .eq('id', agent.id);
    if (error) throw error;
    console.log(`Agent ${agent.agent_name}: used=${current_used} limit ${agent.ai_ops_limit} → ${new_limit}  (${new_limit - current_used} tareas disponibles)`);
  }

  const { data: after } = await sb
    .from('voice_agents')
    .select('id, agent_name, ai_ops_used, ai_ops_limit, active')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('AFTER:', after);
}

main().catch(e => { console.error(e); process.exit(1); });
