import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const { data: logs } = await sb
    .from('llm_call_log')
    .select('created_at, source, usage, latency_ms, error, meta')
    .eq('agent_id', agentId)
    .eq('source', 'agent_chat')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(`\n=== Últimos ${logs?.length ?? 0} chat calls (30 min) ===`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`\n  ${row.created_at.slice(11, 23)}`);
    console.log(`  latency: ${row.latency_ms}ms`);
    console.log(`  usage: ${JSON.stringify(row.usage)}`);
    console.log(`  meta: ${JSON.stringify(row.meta)}`);
    if (row.error) console.log(`  ERROR: ${row.error.slice(0, 300)}`);
  }

  // mutations últimos 30 min para ver si Nami realmente invocó algo
  const { data: mut } = await sb
    .from('inventory_mutations_log')
    .select('created_at, tool_name, success, error_code, serie')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  console.log(`\n=== inventory_mutations_log last 30 min: ${mut?.length ?? 0} ===`);
  for (const r of mut ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  err=${row.error_code ?? '-'}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
