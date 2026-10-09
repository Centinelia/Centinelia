import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;
  const since = new Date(Date.now() - 90 * 60 * 1000).toISOString();  // 90 min

  // 1) LLM calls last 90 min — breakdown por source + cache stats
  const { data: logs } = await sb
    .from('llm_call_log')
    .select('created_at, source, model, usage, meta, latency_ms, error')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log(`=== LLM calls last 90 min (${logs?.length ?? 0}) ===\n`);
  const byBranch: Record<string, { count: number; cached: number; input: number; output: number; errors: number }> = {};
  for (const r of logs ?? []) {
    const row = r as any;
    const src = (row.source ?? '?') as string;
    byBranch[src] ||= { count: 0, cached: 0, input: 0, output: 0, errors: 0 };
    byBranch[src].count++;
    if (row.error) byBranch[src].errors++;
    const u = (row.usage ?? {}) as Record<string, number>;
    byBranch[src].input  += (u.input_tokens ?? 0);
    byBranch[src].output += (u.output_tokens ?? 0);
    byBranch[src].cached += (u.cache_read_input_tokens ?? 0);
  }
  for (const [src, s] of Object.entries(byBranch)) {
    const cachePct = s.input > 0 ? Math.round((s.cached / (s.input + s.cached)) * 100) : 0;
    console.log(`  ${src.padEnd(32)}  calls=${s.count}  errors=${s.errors}  input=${s.input}  cached=${s.cached} (${cachePct}%)  output=${s.output}`);
  }

  // 2) Agent chat: últimas 5 llamadas detalle
  const chatCalls = (logs ?? []).filter(r => (r as any).source === 'agent_chat').slice(0, 5);
  console.log(`\n=== Últimas ${chatCalls.length} llamadas al chat ===`);
  for (const r of chatCalls) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  latency=${row.latency_ms}ms  usage=${JSON.stringify(row.usage)}  meta=${JSON.stringify(row.meta)}`);
    if (row.error) console.log(`    ERROR: ${row.error.slice(0, 200)}`);
  }

  // 3) Inbox processor: últimas 5 ejecuciones + status final
  const inboxCalls = (logs ?? []).filter(r => (r as any).source === 'inbox_processor_summary');
  console.log(`\n=== Últimas ejecuciones del inbox-processor (${inboxCalls.length}) ===`);
  for (const r of inboxCalls.slice(0, 8)) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  meta=${JSON.stringify(row.meta)}`);
  }

  // 4) Correos procesados últimas 90 min
  const { data: inbox } = await sb
    .from('ops_inbox')
    .select('created_at, email_from, email_subject, status, category, sent_at')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15);
  console.log(`\n=== Correos procesados (ops_inbox) last 90 min: ${inbox?.length ?? 0} ===`);
  for (const r of inbox ?? []) {
    const row = r as any;
    const sent = row.sent_at ? ' ✉️SENT' : '';
    console.log(`  ${row.created_at.slice(11, 19)}  ${row.status.padEnd(16)}  cat=${row.category ?? '?'}${sent}`);
    console.log(`    from: ${(row.email_from ?? '').slice(0, 55)}`);
    console.log(`    subj: ${(row.email_subject ?? '').slice(0, 80)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
