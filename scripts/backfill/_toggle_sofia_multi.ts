/**
 * Toggle Sofia multilingual on/off temporalmente.
 * Uso: npx tsx --env-file=.env.local scripts/backfill/_toggle_sofia_multi.ts off
 *      npx tsx --env-file=.env.local scripts/backfill/_toggle_sofia_multi.ts on
 */
import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const arg = (process.argv[2] ?? 'off').toLowerCase();
  const enable = arg === 'on';
  const { data: current } = await supa.from('voice_agents')
    .select('features').eq('id', SOFIA_ID).single();
  const features = (current?.features ?? {}) as Record<string, unknown>;
  const before = features.multilingual;
  features.multilingual = enable;
  const { error } = await supa.from('voice_agents')
    .update({ features }).eq('id', SOFIA_ID);
  if (error) { console.error(error); process.exit(1); }
  console.log(`multilingual: ${before} → ${enable}`);
  console.log('Recuerda correr: npx tsx --env-file=.env.local scripts/backfill/resync-sofia.ts');
}
main().catch(console.error);
