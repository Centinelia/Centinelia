import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: inbox } = await sb.from('ops_inbox').select('*').eq('agent_id', agentId).ilike('email_subject', '%33333%').order('created_at', { ascending: false });
  console.log(`TEST-33333 en ops_inbox: ${inbox?.length ?? 0}`);
  for (const r of inbox ?? []) {
    const row = r as any;
    console.log(`\n  id: ${row.id}`);
    console.log(`  created: ${row.created_at}`);
    console.log(`  status: ${row.status}  cat: ${row.category}  sent_at: ${row.sent_at ?? 'no'}`);
    const atts = (row.attachments ?? []) as any[];
    console.log(`  attachments: ${atts.length} ${atts.map(a => a.name ?? '?').join(', ')}`);
    console.log(`\n  AI_SUMMARY: ${row.ai_summary?.slice(0, 500) ?? '(null)'}`);
    console.log(`\n  AI_DRAFT:\n${row.ai_draft ?? '(null)'}`);
  }

  // DEBUG LOG ⭐
  const { data: debugLogs } = await sb.from('llm_call_log')
    .select('created_at, meta')
    .eq('agent_id', agentId)
    .eq('source', 'inbox_processor_force_tool_decision')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  console.log(`\n⭐ DEBUG FORCE TOOL (${debugLogs?.length ?? 0}):`);
  for (const r of debugLogs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}`);
    console.log(`  tools_count=${row.meta?.tools_count}  has_oc_tool=${row.meta?.has_oc_tool}  forced=${row.meta?.forced_tool_name}`);
    console.log(`  subject: ${row.meta?.subject}`);
    console.log(`  attachments: ${row.meta?.attachment_names?.join(', ')}`);
  }

  const { data: mut } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, success, error_code, serie, before_state, after_state')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  console.log(`\n=== 🎯 mutations last 10 min: ${mut?.length ?? 0} ===`);
  for (const r of mut ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  err=${row.error_code ?? '-'}  serie=${row.serie ?? '-'}`);
  }

  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta, error')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false }).limit(15);
  console.log(`\n=== llm_call_log (${logs?.length ?? 0}) ===`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}  meta=${JSON.stringify(row.meta ?? {}).slice(0, 200)}${row.error ? '  ERR=' + row.error.slice(0, 150) : ''}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
