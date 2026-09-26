import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('voice_agents')
    .select('id, agent_name, phone_number, portal_email, active')
    .eq('id', 'a8e35a06-f391-4434-a76c-ea076ca8ae30').single();
  console.log('Agent phone_number:', JSON.stringify(data?.phone_number), 'active:', data?.active);
  const { data: match } = await sb.from('voice_agents')
    .select('id, agent_name').eq('phone_number', '+523321014544');
  console.log('Match rows for +523321014544:', match?.length ?? 0, match);
}
main().catch(e=>console.error(e));
