import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s
    .from('agent_runs')
    .select('agent_id, started_at, tools_called, llm_calls, duration_ms')
    .order('started_at', { ascending: false })
    .limit(5);
  console.log('Last 5 agent_runs (any agent):');
  for (const r of data ?? []) {
    console.log(`  ${r.started_at?.slice(11, 19)} agent=${(r.agent_id as string)?.slice(0, 8)} tools=${JSON.stringify(r.tools_called)} llm=${r.llm_calls}`);
  }
}
main().catch(err => { console.error(err); process.exit(1); });
