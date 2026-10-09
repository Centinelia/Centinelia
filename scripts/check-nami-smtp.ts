import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agent } = await sb
    .from('voice_agents')
    .select('agent_name, role, features')
    .eq('portal_email', 'camila@acproyectos.com')
    .eq('agent_name', 'Nami')
    .maybeSingle();
  console.log('AGENT:', JSON.stringify(agent, null, 2));
  const feats = (agent as any)?.features ?? {};
  console.log('\nhas smtp_config?', 'smtp_config' in feats);
  console.log('has gmail_integration?', 'gmail_integration' in feats);
  console.log('has outlook_integration?', 'outlook_integration' in feats);
  console.log('has microsoft_integration?', 'microsoft_integration' in feats);
  const { data: integ } = await sb
    .from('integration_accounts')
    .select('provider, account_email, created_at')
    .eq('portal_email', 'camila@acproyectos.com');
  console.log('\nINTEGRATION_ACCOUNTS:', JSON.stringify(integ, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
