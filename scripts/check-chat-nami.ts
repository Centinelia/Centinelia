import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // tool-calls recentes
  const { data: tools } = await sb
    .from('ai_tool_calls')
    .select('created_at, tool_name, status, args_json, output_json')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`ai_tool_calls last 30 min: ${tools?.length ?? 0}`);
  for (const r of tools ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.tool_name}  ${row.status}`);
    if (row.args_json) console.log(`    args: ${JSON.stringify(row.args_json).slice(0, 200)}`);
    if (row.output_json) console.log(`    out:  ${JSON.stringify(row.output_json).slice(0, 200)}`);
  }

  // conversational messages (chat)
  for (const tbl of ['agent_chat_messages', 'chat_messages', 'conversation_messages']) {
    const { data, error } = await sb.from(tbl).select('*').eq('agent_id', agentId).gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()).order('created_at', { ascending: false }).limit(5);
    if (!error && data && data.length > 0) {
      console.log(`\nTABLE ${tbl}:`);
      for (const m of data as any[]) {
        console.log(`  ${m.created_at?.slice(11, 19)}  role=${m.role ?? m.sender ?? '?'}  content=${String(m.content ?? m.message ?? '').slice(0, 200)}`);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
