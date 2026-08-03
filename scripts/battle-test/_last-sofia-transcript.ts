/**
 * Fetch the last Vapi call for Sofia and print the transcript so we can see
 * the exact phrase she used at goodbye (to know why endCallPhrases didn't match).
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const SOFIA_VAPI = '6b663688-a610-46e8-be2b-c9615d461e85';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: rows, error } = await s
    .from('voice_calls')
    .select('vapi_call_id, agent_id, created_at, duration_seconds, caller_number, outcome, transcript, summary')
    .in('agent_id', ['9a0c935a-2b47-432a-a2c3-c67bbf915905'])
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) { console.error(error); return; }
  console.log(`Rows found: ${rows?.length}`);
  const last = rows?.[0];
  console.log('vapi_call_id:', last?.vapi_call_id);
  console.log('created_at:', last?.created_at, '| ended_at:', last?.ended_at);
  console.log('duration:', last?.duration_seconds, 's | outcome:', last?.outcome);
  console.log('summary:', last?.summary);
  console.log('\n--- TRANSCRIPT ---');
  console.log(last?.transcript ?? '(no transcript in DB)');

  if (last?.vapi_call_id) {
    const key = process.env.VAPI_API_KEY!;
    const res = await fetch(`https://api.vapi.ai/call/${last.vapi_call_id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const raw = await res.json();
    console.log('\n--- VAPI endedReason ---');
    console.log('endedReason:', raw.endedReason);
    console.log('\n--- LAST 10 TRANSCRIPT MESSAGES ---');
    const msgs = (raw.messages ?? []) as any[];
    for (const m of msgs.slice(-14)) {
      if (m.role === 'system' || m.role === 'tool_calls') continue;
      const txt = (m.message ?? m.content ?? m.result ?? '').toString().slice(0, 250);
      console.log(`  [${m.role}] ${txt}`);
    }
  }
}
main().catch(err => { console.error(err); process.exit(1); });
