import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const NAMI_ID = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { data: logs } = await supabase
  .from('ai_ops_log')
  .select('created_at, source, label, count, ops_delta, reason')
  .eq('agent_id', NAMI_ID)
  .order('created_at', { ascending: false })
  .limit(20);

console.log(`=== NAMI ai_ops_log (last 20) ===`);
if (!logs?.length) console.log('  (empty)');
for (const l of logs ?? []) {
  const t = new Date(l.created_at).toISOString().slice(11, 19);
  console.log(`  ${t} | ${l.source} | count=${l.count ?? 'n/a'} | delta=${l.ops_delta ?? 'n/a'} | ${l.label ?? l.reason ?? ''}`);
}

const { data: runs } = await supabase
  .from('agent_runs')
  .select('started_at, duration_ms, tools_called, llm_calls')
  .eq('agent_id', NAMI_ID)
  .order('started_at', { ascending: false })
  .limit(10);

console.log(`\n=== NAMI agent_runs (last 10) ===`);
if (!runs?.length) console.log('  (empty)');
for (const r of runs ?? []) {
  const t = new Date(r.started_at).toISOString().slice(11, 19);
  console.log(`  ${t} | duration=${r.duration_ms}ms | llm_calls=${r.llm_calls} | tools=${JSON.stringify(r.tools_called)}`);
}

const { data: llmLogs } = await supabase
  .from('llm_call_log')
  .select('created_at, source, model, latency_ms, error, meta, input_tokens, output_tokens')
  .eq('agent_id', NAMI_ID)
  .order('created_at', { ascending: false })
  .limit(10);

console.log(`\n=== NAMI llm_call_log (last 10) ===`);
if (!llmLogs?.length) console.log('  (empty)');
for (const l of llmLogs ?? []) {
  const t = new Date(l.created_at).toISOString().slice(11, 19);
  console.log(`  ${t} | ${l.source} | ${l.model} | ${l.latency_ms}ms | in=${l.input_tokens} out=${l.output_tokens} | error=${l.error ?? 'null'}`);
}
