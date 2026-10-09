import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const { data: logs } = await sb
    .from('llm_call_log')
    .select('*')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`last 30 min: ${logs?.length ?? 0} LLM calls for Nami`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`\n  ${row.created_at.slice(11, 19)}  src=${row.source}  model=${row.model?.slice(0, 25)}`);
    console.log(`    tokens: in=${row.usage?.input_tokens ?? '?'} out=${row.usage?.output_tokens ?? '?'}  latency=${row.latency_ms ?? '?'}ms`);
    if (row.error) console.log(`    ERROR: ${row.error.slice(0, 200)}`);
    if (row.meta) console.log(`    meta: ${JSON.stringify(row.meta).slice(0, 200)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
