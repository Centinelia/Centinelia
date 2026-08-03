import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { recallForCaller } from '../../src/lib/memory/recall';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PHONE = '+528112803360';
const KEEP_ID = 'dc00159e-fad0-433e-b0bb-d25c6b8ebf8a'; // my seed with facts

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const all = await s.from('memory_entities').select('id, name, attributes').eq('agent_id', SOFIA_ID);
  const matches = (all.data ?? []).filter((e: any) => e.attributes?.phone_number === PHONE);
  console.log(`Encontré ${matches.length} entities con teléfono ${PHONE}`);

  for (const m of matches) {
    if (m.id === KEEP_ID) { console.log(`  KEEP: ${m.id} (${m.name})`); continue; }
    // Check facts count first
    const { count } = await s.from('memory_facts').select('id', { count: 'exact', head: true }).eq('subject_id', m.id);
    console.log(`  DELETE: ${m.id} (${m.name}) — tiene ${count} facts`);
    if ((count ?? 0) > 0) {
      // Migrate facts to KEEP entity instead of deleting them
      await s.from('memory_facts').update({ subject_id: KEEP_ID }).eq('subject_id', m.id);
      console.log(`     migré ${count} facts a KEEP entity`);
    }
    await s.from('memory_entities').delete().eq('id', m.id);
  }

  console.log('\n--- recall después de dedup ---');
  const recall = await recallForCaller({ agentId: SOFIA_ID, callerNumber: PHONE });
  console.log('callerName:', recall.callerName);
  console.log('factCount:', recall.factCount);
  console.log('\nBLOCK:');
  console.log(recall.block ?? '(null)');
}
main().catch(err => { console.error(err); process.exit(1); });
