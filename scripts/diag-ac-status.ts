import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Pool status
  const { data: acct } = await sb.from('account_ops').select('*').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  console.log('ACCOUNT_OPS:', acct);
  const { data: org } = await sb.from('organizations').select('monthly_ops_pool, monthly_ops_used, ops_ledger_enabled').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  console.log('ORG:', org);

  // Último ai_ops_log ANY source
  const { data: ops } = await sb.from('ai_ops_log').select('created_at, source, count, reference_id').eq('portal_email', 'camila@acproyectos.com').gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(10);
  console.log(`\nai_ops_log last 60 min (${ops?.length ?? 0}):`);
  for (const r of ops ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}  count=${row.count}  ref=${(row.reference_id ?? '').slice(0, 50)}`);
  }

  // llm_call_log cualquier source
  const { data: agents } = await sb.from('voice_agents').select('id, agent_name').eq('portal_email', 'camila@acproyectos.com');
  const agentIds = (agents ?? []).map((a: any) => a.id);
  const { data: llms } = await sb.from('llm_call_log').select('created_at, source').in('agent_id', agentIds).gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(10);
  console.log(`\nllm_call_log last 60 min (${llms?.length ?? 0}):`);
  for (const r of llms ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
