import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { recallForCaller } from '../../src/lib/memory/recall';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await s.from('memory_entities').update({ name: 'Nazre', canonical_name: 'nazre' }).eq('id', 'dc00159e-fad0-433e-b0bb-d25c6b8ebf8a');
  const recall = await recallForCaller({ agentId: '9a0c935a-2b47-432a-a2c3-c67bbf915905', callerNumber: '+528112803360' });
  console.log('callerName:', recall.callerName);
  console.log('BLOCK:\n' + recall.block);
}
main().catch(err => { console.error(err); process.exit(1); });
