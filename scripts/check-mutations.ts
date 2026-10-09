import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const { data: all } = await sb.from('inventory_mutations_log').select('*').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(10);
  console.log(`inventory_mutations_log total para Nami: ${all?.length ?? 0}`);
  for (const r of (all ?? []).slice(0, 5)) {
    const row = r as any;
    console.log(`\n  ${row.created_at}  ${row.tool_name}  success=${row.success}  err=${row.error_code ?? '-'}`);
    console.log(`  after: ${JSON.stringify(row.after_state).slice(0, 200)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
