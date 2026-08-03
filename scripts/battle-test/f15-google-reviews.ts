/**
 * F15 audit: no hay dispatcher SMS/WA post-llamada (bloqueante conocido).
 * Sólo confirmo que el storage + UI funcionan: PATCH del campo google_review_url
 * en features y GET lo devuelve.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Read current
  const { data: before } = await s.from('voice_agents').select('features').eq('id', SOFIA_ID).single();
  const featuresBefore = (before?.features as Record<string, unknown>) ?? {};
  console.log('features.google_review_url BEFORE:', featuresBefore.google_review_url ?? '(unset)');

  // Write
  const newUrl = 'https://g.page/r/CJXYZ_battle_test';
  const { error: writeErr } = await s
    .from('voice_agents')
    .update({ features: { ...featuresBefore, google_review_url: newUrl } })
    .eq('id', SOFIA_ID);
  console.log('write:', writeErr ? `ERR ${writeErr.message}` : 'OK');

  // Read back
  const { data: after } = await s.from('voice_agents').select('features').eq('id', SOFIA_ID).single();
  const readBack = (after?.features as any)?.google_review_url;
  console.log('features.google_review_url AFTER:', readBack);
  console.log('roundtrip matches:', readBack === newUrl ? '✅' : '🔴');

  // Cleanup
  await s.from('voice_agents').update({ features: featuresBefore }).eq('id', SOFIA_ID);

  console.log('\n⚠️ Storage funciona pero NO hay dispatcher post-llamada (SMS/WA)');
  console.log('   → Feature parcial per handoff. Ver deuda F15 en handoff.');
}
main().catch(err => { console.error(err); process.exit(1); });
