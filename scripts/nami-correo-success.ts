import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // Breakdown de status de ops_inbox últimos 7 días
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: inbox } = await sb
    .from('ops_inbox')
    .select('status, category, sent_at, created_at, email_subject')
    .eq('agent_id', agentId)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false });
  console.log(`\n=== 7 días breakdown por status (${inbox?.length ?? 0}) ===`);
  const byStatus: Record<string, number> = {};
  const sentCount = { yes: 0, no: 0 };
  for (const r of inbox ?? []) {
    const s = (r as any).status as string;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    if ((r as any).sent_at) sentCount.yes++; else sentCount.no++;
  }
  for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(20)}  ${n}`);
  }
  console.log(`\n  Correos con sent_at (Nami respondió): ${sentCount.yes}`);
  console.log(`  Correos sin sent_at: ${sentCount.no}`);

  // Tool invocations exitosas últimos 7 días
  const { data: toolCalls } = await sb
    .from('ai_tool_calls')
    .select('created_at, tool_name, status')
    .eq('agent_id', agentId)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false });
  console.log(`\n=== Tool invocations 7 días (${toolCalls?.length ?? 0}) ===`);
  const byTool: Record<string, { ok: number; err: number }> = {};
  for (const r of toolCalls ?? []) {
    const t = (r as any).tool_name as string;
    byTool[t] ||= { ok: 0, err: 0 };
    if ((r as any).status === 'ok' || (r as any).status === 'success') byTool[t].ok++;
    else byTool[t].err++;
  }
  for (const [t, v] of Object.entries(byTool).sort((a, b) => (b[1].ok + b[1].err) - (a[1].ok + a[1].err))) {
    console.log(`  ${t.padEnd(35)}  ok=${v.ok}  err=${v.err}`);
  }

  // Correos con sent_at (respondidos) últimas 48h
  const { data: sent } = await sb
    .from('ops_inbox')
    .select('created_at, sent_at, email_from, email_subject, status, category')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString())
    .not('sent_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(15);
  console.log(`\n=== Correos QUE Nami respondió último 48h (${sent?.length ?? 0}) ===`);
  for (const r of sent ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(5, 19)}  status=${row.status.padEnd(16)}  cat=${row.category ?? '?'}`);
    console.log(`    from: ${(row.email_from ?? '').slice(0, 55)}`);
    console.log(`    subj: ${(row.email_subject ?? '').slice(0, 80)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
