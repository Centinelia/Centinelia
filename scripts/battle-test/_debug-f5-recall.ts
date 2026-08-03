import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { createPostgresStore } from '../../src/lib/memory/postgres-store';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PHONE = '+528112803360';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: ent } = await s
    .from('memory_entities')
    .select('*')
    .eq('agent_id', SOFIA_ID)
    .ilike('name', '%battle test f5%')
    .limit(3);
  console.log('memory_entities matching name:');
  console.log(JSON.stringify(ent, null, 2));

  if (ent?.[0]) {
    const { data: facts } = await s
      .from('memory_facts')
      .select('*')
      .eq('subject_id', ent[0].id)
      .limit(10);
    console.log(`\nfacts for ${ent[0].id}: ${facts?.length}`);
  }

  const store = createPostgresStore();
  console.log('\n--- store.query by canonicalName ---');
  const q1 = await store.query({ agentId: SOFIA_ID, entityCanonicalName: 'nazre (battle test f5)' });
  console.log('entity found:', !!q1.entity, 'facts:', q1.facts.length);

  console.log('\n--- store.query by phone ---');
  const q2 = await store.query({ agentId: SOFIA_ID, entityPhone: PHONE });
  console.log('entity found:', !!q2.entity, 'facts:', q2.facts.length);
  console.log('entity id:', q2.entity?.id, 'name:', q2.entity?.name);

  console.log('\n--- ALL entities with this phone ---');
  const all = await s.from('memory_entities').select('id, name, attributes').eq('agent_id', SOFIA_ID);
  const matches = (all.data ?? []).filter((e: any) => e.attributes?.phone_number === PHONE);
  console.log(`Total entities: ${all.data?.length}. Matching ${PHONE}: ${matches.length}`);
  for (const m of matches) console.log(`  - ${m.id} | ${m.name}`);

  const q3 = await store.query({ agentId: SOFIA_ID, entityPhone: '8112803360' });
  console.log('by 8112803360:', !!q3.entity);

  const q4 = await store.query({ agentId: SOFIA_ID, entityPhone: '528112803360' });
  console.log('by 528112803360:', !!q4.entity);
}
main().catch(err => { console.error(err); process.exit(1); });
