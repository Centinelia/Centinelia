/**
 * F5 real-call setup: seed a few memory facts for TU número (Nazre) en el
 * memory graph de Sofia. Cuando vuelvas a llamar, el bloque MEMORIA DE... debe
 * aparecer en tu prompt y Sofia debería saludarte por nombre + mencionar los
 * facts sin preguntarlos.
 *
 * Uso: pasa tu número como env var TEST_CALLER_NUMBER (formato +52...).
 *
 *   TEST_CALLER_NUMBER=+528112345678 npx tsx scripts/battle-test/f5-setup-memory.ts
 */
import { loadEnv } from './_env';
loadEnv();
import { createPostgresStore } from '../../src/lib/memory/postgres-store';
import { recallForCaller } from '../../src/lib/memory/recall';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const callerNumber = process.env.TEST_CALLER_NUMBER;
  if (!callerNumber || !/^\+\d{10,15}$/.test(callerNumber)) {
    console.error('Falta env var TEST_CALLER_NUMBER en formato +52...');
    console.error('Ejemplo: TEST_CALLER_NUMBER=+528112345678 npx tsx scripts/battle-test/f5-setup-memory.ts');
    process.exit(1);
  }

  const store = createPostgresStore();

  // Seed entity + facts distintivos
  const NAME = 'Nazre (Battle Test F5)';
  const entity = await store.upsertEntity({
    agentId:    SOFIA_ID,
    entityType: 'customer',
    name:       NAME,
    attributes: { phone_number: callerNumber, email: 'nazre20@gmail.com' },
  });
  console.log(`✓ Entity: ${NAME} (${entity.id})`);

  const facts = [
    { predicate: 'requested',         objectText: 'una demo de la tienda Shopify con integración WhatsApp' },
    { predicate: 'prefers',           objectText: 'reuniones por Zoom los viernes por la tarde' },
    { predicate: 'has_credit_of',     objectNumber: 12500 },
    { predicate: 'account_status_is', objectText: 'prospecto caliente listo para firmar' },
  ];
  for (const f of facts) {
    await store.createFact({
      agentId:    SOFIA_ID,
      subjectId:  entity.id,
      predicate:  f.predicate,
      objectText: (f as any).objectText,
      objectNumber: (f as any).objectNumber,
      confidence: 0.95,
    });
  }
  console.log(`✓ ${facts.length} facts seeded`);

  const recall = await recallForCaller({ agentId: SOFIA_ID, callerNumber });
  console.log('\n--- Preview del bloque que Sofia va a ver ---\n');
  console.log(recall.block ?? '(no block generated)');

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(' PASO SIGUIENTE — TU PARTE:');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  1. Llama al +18124899525 desde ${callerNumber}`);
  console.log(`  2. Sofia debería:`);
  console.log(`     - Saludarte usando el nombre "${NAME}" (o al menos el nombre)`);
  console.log(`     - Referirse a la demo Shopify+WA sin que le preguntes`);
  console.log(`     - Sugerir un viernes por la tarde para agendar (por prefers)`);
  console.log(`     - Reconocer el crédito o el estatus de prospecto caliente`);
  console.log(`  3. Preguntale directamente: "¿de qué habíamos hablado la última vez?"`);
  console.log(`     Debería mencionar los facts sin inventar.`);
  console.log('');
  console.log(`  Al colgar avísame y verifico Vapi transcript.`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log('\n(Para limpiar después del test: correr f5-cleanup-memory.ts con mismo entity id)');
  console.log(`Entity ID a limpiar: ${entity.id}`);
}
main().catch(err => { console.error(err); process.exit(1); });
