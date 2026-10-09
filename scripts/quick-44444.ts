import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // último correo recibido (cualquier subject)
  const { data: inbox } = await sb.from('ops_inbox').select('*').eq('agent_id', agentId).gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(3);
  console.log(`Correos nuevos last 10 min: ${inbox?.length ?? 0}`);
  for (const r of inbox ?? []) {
    const row = r as any;
    console.log(`\n  id: ${row.id}`);
    console.log(`  created: ${row.created_at}`);
    console.log(`  subj: ${row.email_subject}`);
    console.log(`  status: ${row.status}  cat: ${row.category}  sent_at: ${row.sent_at ?? 'no'}`);
    const atts = (row.attachments ?? []) as any[];
    console.log(`  attachments: ${atts.length} ${atts.map(a => a.name ?? '?').join(', ')}`);
    console.log(`\n  AI_SUMMARY: ${row.ai_summary?.slice(0, 400) ?? '(null)'}`);
    console.log(`\n  AI_DRAFT:\n${row.ai_draft ?? '(null)'}`);
  }

  // DEBUG LOG ⭐
  const { data: debugLogs } = await sb.from('llm_call_log')
    .select('created_at, meta')
    .eq('agent_id', agentId)
    .eq('source', 'inbox_processor_force_tool_decision')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  console.log(`\n\n⭐ === DEBUG FORCE TOOL (${debugLogs?.length ?? 0}) === ⭐`);
  for (const r of debugLogs ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}`);
    console.log(`  META:`, JSON.stringify(row.meta, null, 2));
  }

  const { data: mut } = await sb.from('inventory_mutations_log')
    .select('created_at, tool_name, success, error_code')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  console.log(`\n=== 🎯 mutations last 10 min: ${mut?.length ?? 0} ===`);
  for (const r of mut ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  err=${row.error_code ?? '-'}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
