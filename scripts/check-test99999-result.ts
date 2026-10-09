import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // Busca TEST-99999 en ops_inbox
  const { data: inbox } = await sb
    .from('ops_inbox')
    .select('*')
    .eq('agent_id', agentId)
    .ilike('email_subject', '%TEST-99999%')
    .order('created_at', { ascending: false });
  console.log(`TEST-99999 en ops_inbox: ${inbox?.length ?? 0}`);
  for (const r of inbox ?? []) {
    const row = r as any;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`ID: ${row.id}`);
    console.log(`  created: ${row.created_at}`);
    console.log(`  status: ${row.status}  cat: ${row.category}  sent_at: ${row.sent_at ?? 'no'}`);
    console.log(`  attachments: ${((row.attachments ?? []) as any[]).length}`);
    console.log(`\n  AI_SUMMARY:\n${row.ai_summary ?? '(null)'}`);
    console.log(`\n  AI_DRAFT:\n${row.ai_draft ?? '(null)'}`);
  }

  // Mutations relacionadas con TEST-99999 o OCTEST99999 o fecha reciente
  const { data: mut } = await sb
    .from('inventory_mutations_log')
    .select('created_at, tool_name, success, error_code, serie, before_state, after_state')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  console.log(`\n\n=== inventory_mutations_log last 30 min: ${mut?.length ?? 0} ===`);
  for (const r of mut ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  serie=${row.serie ?? '-'}  err=${row.error_code ?? '-'}`);
  }

  // Validator events
  const { data: logs } = await sb
    .from('llm_call_log')
    .select('created_at, source, meta, error')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .in('source', ['inbox_processor', 'inbox_processor_summary', 'inbox_processor_validator_fail', 'inbox_processor_validator_hard_fail'])
    .order('created_at', { ascending: false });
  console.log(`\n=== inbox_processor LLM calls (${logs?.length ?? 0}) ===`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}  meta=${JSON.stringify(row.meta ?? {}).slice(0, 200)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
