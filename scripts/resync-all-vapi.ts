/**
 * One-off: sync todos los voice_agents activos a Vapi.
 *
 * Uso: `npx tsx scripts/resync-all-vapi.ts`
 *
 * Cuándo correr: después de cambiar copy en prompt-builder.ts o tool descriptions
 * en vapi/sync.ts. Los agentes de chat/email leen el prompt en cada request, pero
 * los voice agents necesitan sync explícito porque el assistant vive en Vapi.
 *
 * Requiere env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPI_API_KEY.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { pushConversationalPromptsToAllAgents } from '../src/lib/vapi/sync';

async function main() {
  console.log('[resync-all-vapi] iniciando sync de voice agents…');
  const start  = Date.now();
  const result = await pushConversationalPromptsToAllAgents();
  const ms     = Date.now() - start;

  console.log(`\n[resync-all-vapi] ${result.synced} sincronizados, ${result.errors} errores en ${(ms / 1000).toFixed(1)}s\n`);

  if (result.errors > 0) {
    console.log('Errores:');
    for (const d of result.details.filter(x => !x.ok)) {
      console.log(`  - ${d.name} (${d.id}): ${d.error}`);
    }
  }

  if (result.phoneFixes > 0) {
    console.log(`\nPhone reassigns: ${result.phoneFixes}`);
  }
}

main().catch(err => {
  console.error('[resync-all-vapi] fatal:', err);
  process.exit(1);
});
