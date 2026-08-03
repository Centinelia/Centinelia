/** Reproduces the findNoxAgent supabase query to check whether knowledge_base
 *  is really dropped from voice_agents. */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await s
    .from('voice_agents')
    .select('id, agent_name, transfer_whatsapp, client_email, portal_email, features')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .eq('active', true);
  console.log({ rows: data?.length ?? 0, error: error?.message });
}
main().catch(err => { console.error(err); process.exit(1); });
