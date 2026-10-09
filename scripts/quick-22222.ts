import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: inbox } = await sb.from('ops_inbox').select('*').eq('agent_id', agentId).ilike('email_subject', '%22222%').order('created_at', { ascending: false });
  console.log(`TEST-22222 en ops_inbox: ${inbox?.length ?? 0}`);
  for (const r of inbox ?? []) {
    const row = r as any;
    console.log(`\n  id: ${row.id}`);
    console.log(`  created: ${row.created_at}`);
    console.log(`  status: ${row.status}  cat: ${row.category}  sent_at: ${row.sent_at ?? 'no'}`);
    const atts = (row.attachments ?? []) as any[];
    console.log(`  attachments: ${atts.length} ${atts.map(a => a.name ?? '?').join(', ')}`);
    console.log(`\n  AI_SUMMARY: ${row.ai_summary?.slice(0, 600) ?? '(null)'}`);
    console.log(`\n  AI_DRAFT:\n${row.ai_draft ?? '(null)'}`);
  }

  const { data: debugLogs } = await sb.from('llm_call_log')
    .select('created_at, meta')
    .eq('agent_id', agentId)
    .eq('source', 'inbox_processor_force_tool_decision')
    .gte('created_at', since)
    .order('created_at', { ascending: false }).limit(3);
  console.log(`\n⭐ DEBUG FORCE TOOL (${debugLogs?.length ?? 0}):`);
  for (const r of debugLogs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  tools=${row.meta?.tools_count}  has_oc=${row.meta?.has_oc_tool}  forced=${row.meta?.forced_tool_name}`);
  }

  const { data: mut } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, success, error_code, serie, after_state')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  console.log(`\n=== 🎯🎯🎯 MUTATIONS ÚLTIMOS 10 MIN: ${mut?.length ?? 0} 🎯🎯🎯 ===`);
  for (const r of mut ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  err=${row.error_code ?? '-'}  serie=${row.serie ?? '-'}`);
    if (row.after_state) console.log(`    after: ${JSON.stringify(row.after_state).slice(0, 200)}`);
  }

  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta, error')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false }).limit(15);
  console.log(`\n=== llm_call_log (${logs?.length ?? 0}) ===`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}  ${row.error ? 'ERR=' + row.error.slice(0, 120) : 'meta=' + JSON.stringify(row.meta ?? {}).slice(0, 200)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
