/**
 * F13 battle test: POST /api/portal/sign-contract with Sofia's token, verify
 * voice_agents.contract_accepted_at and contract_ip get populated.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

const APP = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PORTAL_TOKEN = '8892c013-b122-4f11-a9d4-e88a04aff732';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: before } = await s
    .from('voice_agents')
    .select('contract_accepted_at, contract_ip')
    .eq('id', SOFIA_ID)
    .single();
  console.log('BEFORE:', before);

  const res = await fetch(`${APP}/api/portal/sign-contract`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-forwarded-for': '203.0.113.42, 10.0.0.1',
    },
    body: JSON.stringify({ token: PORTAL_TOKEN }),
  });
  console.log(`HTTP ${res.status}:`, await res.json());

  const { data: after } = await s
    .from('voice_agents')
    .select('contract_accepted_at, contract_ip')
    .eq('id', SOFIA_ID)
    .single();
  console.log('\nAFTER:', after);
  const ipOk = after?.contract_ip === '203.0.113.42';
  const tsOk = !!after?.contract_accepted_at && after?.contract_accepted_at !== before?.contract_accepted_at;
  console.log(`IP captured correctly: ${ipOk ? '✅' : '🔴'}`);
  console.log(`Timestamp updated:     ${tsOk ? '✅' : '🔴'}`);

  // Restore prior state
  await s.from('voice_agents').update({
    contract_accepted_at: before?.contract_accepted_at ?? null,
    contract_ip:          before?.contract_ip ?? null,
  }).eq('id', SOFIA_ID);
  console.log('\nRestored prior contract state.');
}
main().catch(err => { console.error(err); process.exit(1); });
