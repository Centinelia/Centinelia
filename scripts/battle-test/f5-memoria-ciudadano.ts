/**
 * F5 battle test: seed a customer entity + a few facts, then call recallForCaller
 * with that phone number and verify the formatted block appears with human-readable
 * predicates. Cleanup at the end.
 */
import { loadEnv } from './_env';
loadEnv();
import { createPostgresStore } from '../../src/lib/memory/postgres-store';
import { recallForCaller } from '../../src/lib/memory/recall';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const TEST_PHONE = '+528188885555';
const TEST_NAME  = 'Ana Torres BATTLE TEST';

async function main() {
  const store = createPostgresStore();

  // Seed entity
  const entity = await store.upsertEntity({
    agentId:    SOFIA_ID,
    entityType: 'customer',
    name:       TEST_NAME,
    attributes: { phone_number: TEST_PHONE },
  });
  console.log(`✓ Seeded entity ${entity.id} (${entity.canonicalName})`);

  // Seed a few facts covering different predicates
  const now = new Date();
  const facts = [
    { predicate: 'has_debt_of',        objectNumber: 8500 },
    { predicate: 'promised_to_pay_on', objectDate:   new Date(now.getTime() + 5 * 86400_000).toISOString().slice(0, 10) },
    { predicate: 'prefers',            objectText:   'pago por WhatsApp' },
    { predicate: 'complained_about',   objectText:   'demora en la última entrega' },
    { predicate: 'account_status_is',  objectText:   'en negociación' },
  ];
  for (const f of facts) {
    await store.createFact({
      agentId:      SOFIA_ID,
      subjectId:    entity.id,
      predicate:    f.predicate,
      objectText:   (f as any).objectText,
      objectNumber: (f as any).objectNumber,
      objectDate:   (f as any).objectDate,
      confidence:   0.95,
    });
  }
  console.log(`✓ Seeded ${facts.length} facts`);

  // Recall
  const recall = await recallForCaller({
    agentId:      SOFIA_ID,
    callerNumber: TEST_PHONE,
  });

  console.log('\n--- RECALL RESULT ---');
  console.log('callerName:', recall.callerName);
  console.log('factCount:', recall.factCount);
  console.log('\nBLOCK:');
  console.log(recall.block ?? '(null)');

  // Assertions
  const b = recall.block ?? '';
  const checks = [
    { name: 'block present',        pass: !!recall.block },
    { name: 'has caller name',      pass: recall.callerName === TEST_NAME },
    { name: 'has 5 facts',          pass: recall.factCount === 5 },
    { name: 'shows debt as money',  pass: /\$8,?500/.test(b) },
    { name: 'shows date in Spanish',pass: /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(b) },
    { name: 'has prefers text',     pass: /pago por WhatsApp/.test(b) },
    { name: 'has NO instruction',   pass: /NO preguntes/.test(b) },
  ];
  console.log('\n--- CHECKS ---');
  for (const c of checks) console.log(`  ${c.pass ? '✅' : '🔴'} ${c.name}`);

  // Cleanup
  const { createClient } = await import('@supabase/supabase-js');
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await s.from('memory_facts').delete().eq('subject_id', entity.id);
  await s.from('memory_entities').delete().eq('id', entity.id);
  console.log('\n✓ Cleaned up.');
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
