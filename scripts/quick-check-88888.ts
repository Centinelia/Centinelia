import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const { data: inbox } = await sb.from('ops_inbox').select('*').eq('agent_id', agentId).ilike('email_subject', '%88888%').order('created_at', { ascending: false });
  console.log(`TEST-88888 en ops_inbox: ${inbox?.length ?? 0}`);
  for (const r of inbox ?? []) {
    const row = r as any;
    console.log(`\n  id: ${row.id}`);
    console.log(`  created: ${row.created_at}`);
    console.log(`  status: ${row.status}  cat: ${row.category}  sent_at: ${row.sent_at ?? 'no'}`);
    console.log(`  attachments: ${((row.attachments ?? []) as any[]).length}`);
    console.log(`\n  AI_SUMMARY: ${row.ai_summary?.slice(0, 400) ?? '(null)'}`);
    console.log(`\n  AI_DRAFT: ${row.ai_draft?.slice(0, 400) ?? '(null)'}`);
  }

  // Mutations recientes
  const { data: mut } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, success, error_code, serie')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  console.log(`\n=== mutations last 15 min: ${mut?.length ?? 0} ===`);
  for (const r of mut ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  err=${row.error_code ?? '-'}  serie=${row.serie ?? '-'}`);
  }

  // llm_call_log recientes
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false }).limit(15);
  console.log(`\n=== llm_call_log last 15 min: ${logs?.length ?? 0} ===`);
  for (const r of logs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}  meta=${JSON.stringify(row.meta ?? {}).slice(0, 180)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
