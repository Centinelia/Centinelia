import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, agent_name, vapi_agent_id, active')
    .eq('portal_email', 'studio@pneumastudio.mx');
  for (const a of data ?? []) {
    console.log(`${a.agent_name}: vapi_agent_id=${a.vapi_agent_id ?? '(NULL)'} active=${a.active}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
