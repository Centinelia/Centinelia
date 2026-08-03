import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await s
    .from('voice_agents')
    .select('id, agent_name, role, knowledge_base, role_knowledge_base, business_name, portal_email')
    .eq('id', '3b3dbeb4-8235-4b98-913a-0208e585d2e3')
    .single();
  console.log({ data, error: error?.message });

  // Also mimic the .in() query the cron uses
  const { data: multi, error: multiErr } = await s
    .from('voice_agents')
    .select('id, agent_name, role, knowledge_base, role_knowledge_base, business_name, portal_email')
    .in('id', ['3b3dbeb4-8235-4b98-913a-0208e585d2e3', '9a0c935a-2b47-432a-a2c3-c67bbf915905']);
  console.log('\n.in() query returned', multi?.length, 'rows, err:', multiErr?.message);
  console.log(multi);
}
main().catch(err => { console.error(err); process.exit(1); });
