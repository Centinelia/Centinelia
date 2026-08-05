import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const { data: calls } = await supa.from('voice_calls')
    .select('*')
    .eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false }).limit(1);

  console.log('KEYS:', Object.keys(calls?.[0] ?? {}).join(', '));
  for (const c of calls ?? []) {
    console.log(JSON.stringify(c, null, 2));
  }

  // Also fetch tool calls
  const callId = calls?.[0]?.id;
  if (callId) {
    const { data: toolCalls } = await supa.from('voice_tool_calls')
      .select('*')
      .eq('call_id', callId);
    console.log(`\n═══ Tool calls (${toolCalls?.length ?? 0}) ═══`);
    for (const t of toolCalls ?? []) console.log(t);
  }
}
main().catch(console.error);
