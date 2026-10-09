import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const { data: integs, error } = await sb.from('email_integrations').select('*').eq('agent_id', agentId);
  console.log('error:', error);
  console.log('integrations:', JSON.stringify(integs, null, 2));

  // Force el cron de email-sync para pullear ahora mismo
  const res = await fetch('https://www.centinelia.mx/api/cron/email-sync', {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log(`\nCron email-sync status: ${res.status}`);
  console.log(`Response: ${await res.text()}`);
}
main().catch(e => { console.error(e); process.exit(1); });
