import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const AGENT_ID = 'a8e35a06-f391-4434-a76c-ea076ca8ae30';

  const { data, error } = await sb
    .from('voice_calls')
    .select('id, created_at, caller_number, outcome, duration_seconds, summary, transcript')
    .eq('agent_id', AGENT_ID)
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) { console.error(error); process.exit(1); }

  for (const c of data ?? []) {
    console.log('---');
    console.log('ID:', c.id);
    console.log('When:', c.created_at, '  Caller:', c.caller_number);
    console.log('Outcome:', c.outcome, '  Duration:', c.duration_seconds, 's');
    console.log('Summary:', (c.summary || '').slice(0, 500));
    console.log('');
    console.log('Transcript (first 4000 chars):');
    console.log((c.transcript || '').slice(0, 4000));
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
