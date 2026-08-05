import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const { data: leads } = await supa.from('leads')
    .select('*').eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false }).limit(3);
  for (const l of leads ?? []) console.log(JSON.stringify(l, null, 2));

  const { data: ops } = await supa.from('ops_log')
    .select('*').eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false }).limit(5);
  console.log('\nOPS_LOG recent:');
  for (const o of ops ?? []) console.log(`  ${o.created_at.slice(11,19)} ${o.op_type} ${o.status} ${o.error ?? ''}`);
}
main().catch(console.error);
