import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('voice_agents')
    .select('id, agent_name, phone_number, active, portal_email, vapi_agent_id')
    .ilike('phone_number', '%3321014544')
    .order('agent_name');
  console.log('agents matching phone:', data);
}
main().catch(e=>console.error(e));
