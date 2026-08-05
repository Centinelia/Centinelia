import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const { data: a } = await supa.from('voice_agents').select('id, agent_name, features, role').eq('id', SOFIA_ID).single();
  console.log('name:', a?.agent_name);
  console.log('role:', a?.role);
  console.log('features:', JSON.stringify(a?.features, null, 2));
}
main().catch(console.error);
