import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // All llm_call_log entries con ERROR recientes
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, error, meta')
    .eq('agent_id', agentId)
    .not('error', 'is', null)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`\nllm_call_log con errors last 15 min: ${logs?.length ?? 0}`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}`);
    console.log(`    error: ${row.error.slice(0, 300)}`);
    console.log(`    meta: ${JSON.stringify(row.meta ?? {}).slice(0, 150)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
