import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const AGENT_ID = 'a8e35a06-f391-4434-a76c-ea076ca8ae30';
  const { data } = await sb.from('tool_call_log')
    .select('tool_name, created_at, input_json')
    .eq('agent_id', AGENT_ID)
    .gte('created_at', '2026-09-26T18:38:00Z')
    .order('created_at', { ascending: false });
  console.log('Tool calls since 18:38 UTC:');
  for (const t of data ?? []) {
    console.log(t.created_at, ' ', t.tool_name, ' input=', JSON.stringify(t.input_json).slice(0, 150));
  }
}
main().catch(e=>console.error(e));
