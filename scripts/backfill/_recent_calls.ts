import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const key = process.env.VAPI_API_KEY!;

async function main() {
  const { data } = await supa.from('voice_calls')
    .select('id, vapi_call_id, duration_seconds, created_at, transcript, outcome')
    .eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false }).limit(6);

  for (const c of data ?? []) {
    console.log(`\n═══ ${c.created_at.slice(11,19)} — ${c.duration_seconds}s — vapi=${c.vapi_call_id?.slice(0,8)} ═══`);
    const r = await fetch(`https://api.vapi.ai/call/${c.vapi_call_id}`, { headers: { Authorization: `Bearer ${key}` } });
    const v = await r.json();
    console.log(`endedReason: ${v.endedReason}`);
    console.log(`TRANSCRIPT:\n${c.transcript}`);
  }
}
main().catch(console.error);
