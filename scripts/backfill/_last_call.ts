import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const { data: calls } = await supa.from('voice_calls')
    .select('id, caller_number, duration_seconds, outcome, created_at, transcript, summary')
    .eq('agent_id', SOFIA_ID)
    .order('created_at', { ascending: false }).limit(3);

  for (const c of calls ?? []) {
    console.log(`\n═══ Call ${c.id.slice(0,8)} — ${c.created_at.slice(0,19)} — ${c.duration_seconds}s — outcome=${c.outcome} ═══`);
    console.log(`SUMMARY: ${c.summary?.slice(0,300) ?? '(no summary)'}`);
    console.log(`\nTRANSCRIPT (primeros 2500 chars):`);
    console.log((c.transcript ?? '(no transcript)').slice(0, 2500));
  }
}
main().catch(console.error);
