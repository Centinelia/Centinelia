import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id, portal_email').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // Try several possible agent_id columns in inventory_mutations_log
  for (const col of ['agent_id', 'portal_email']) {
    const { data, error } = await sb
      .from('inventory_mutations_log')
      .select('created_at, tool_name, success, error_code, ops_charged, serie')
      .eq(col, col === 'agent_id' ? agentId : 'camila@acproyectos.com')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) continue;
    console.log(`\n=== inventory_mutations_log filtering by ${col} (${data?.length ?? 0} rows last 30 days) ===`);
    if ((data?.length ?? 0) > 0) {
      // Breakdown por tool
      const byTool: Record<string, { ok: number; err: number }> = {};
      for (const r of data as any[]) {
        const t = r.tool_name ?? '?';
        byTool[t] ||= { ok: 0, err: 0 };
        if (r.success) byTool[t].ok++; else byTool[t].err++;
      }
      for (const [t, v] of Object.entries(byTool).sort((a, b) => (b[1].ok + b[1].err) - (a[1].ok + a[1].err))) {
        console.log(`  ${t.padEnd(35)}  ok=${v.ok}  err=${v.err}`);
      }
      console.log('\n  Últimas 10:');
      for (const r of (data as any[]).slice(0, 10)) {
        console.log(`    ${r.created_at.slice(5, 19)}  ${r.tool_name.padEnd(35)}  success=${r.success}  err=${r.error_code ?? '-'}  serie=${r.serie ?? '-'}`);
      }
      break;
    }
  }

  // Buscar en llm_call_log por meta.tools_invoked
  const { data: logs } = await sb
    .from('llm_call_log')
    .select('created_at, meta, source')
    .eq('agent_id', agentId)
    .eq('source', 'inbox_processor_summary')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(40);
  console.log(`\n=== Tool invocations desde meta.tools_invoked de inbox_processor_summary últimos 30 días (${logs?.length ?? 0}) ===`);
  const toolHits: Record<string, number> = {};
  for (const r of logs ?? []) {
    const invoked = ((r as any).meta?.tools_invoked ?? []) as string[];
    for (const t of invoked) toolHits[t] = (toolHits[t] ?? 0) + 1;
  }
  for (const [t, n] of Object.entries(toolHits).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(40)}  ${n}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
