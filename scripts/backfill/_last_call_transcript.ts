import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const key = process.env.VAPI_API_KEY!;

async function main() {
  const { data } = await supa.from('voice_calls')
    .select('id, vapi_call_id, duration_seconds, created_at, transcript, outcome, summary')
    .eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false }).limit(1);
  const c = data?.[0];
  if (!c) return;

  console.log(`\n═══ ${c.created_at.slice(0,19)} — ${c.duration_seconds}s — ${c.outcome} ═══`);
  console.log(`SUMMARY: ${c.summary}\n`);
  console.log('TRANSCRIPT:');
  console.log(c.transcript);

  // Vapi tool calls
  const r = await fetch(`https://api.vapi.ai/call/${c.vapi_call_id}`, { headers: { Authorization: `Bearer ${key}` } });
  const v = await r.json();
  console.log(`\nendedReason: ${v.endedReason}`);
  const toolCalls = (v.messages ?? []).filter((m: { toolCalls?: unknown; type?: string }) => m.toolCalls || m.type === 'tool_calls' || m.type === 'tool_result');
  console.log(`\nTool events (${toolCalls.length}):`);
  for (const t of toolCalls) {
    console.log(JSON.stringify(t, null, 2).slice(0, 800));
    console.log('---');
  }
}
main().catch(console.error);
