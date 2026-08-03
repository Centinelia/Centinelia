/**
 * F8 verification (no voice call): set owner_passphrase on Sofia, rebuild the
 * voice prompt via the same builder Vapi sync uses, and grep for the
 * "VERIFICACIÓN INTERNA — EQUIPO Y DUEÑO" block. Restore prior state.
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '../../src/lib/voice/prompt-builder';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // owner_passphrase lives on organizations; PK is portal_email.
  const PORTAL_EMAIL = 'studio@pneumastudio.mx';
  const { data: before } = await s.from('organizations').select('owner_passphrase').eq('portal_email', PORTAL_EMAIL).single();
  const priorPassphrase = (before as any)?.owner_passphrase ?? null;

  const testPass = 'campo minado ' + Date.now();

  await s.from('organizations').update({ owner_passphrase: testPass }).eq('portal_email', PORTAL_EMAIL);

  const { data: agent } = await s.from('voice_agents').select('*').eq('id', SOFIA_ID).single();
  const prompt = await buildSystemPrompt(agent as any, null, PORTAL_EMAIL, s as any);
  const blockOK = prompt.includes('VERIFICACIÓN INTERNA') && prompt.includes(testPass);
  console.log(`Passphrase set to: "${testPass}"`);
  console.log(`Prompt length: ${prompt.length}`);
  console.log(`Contains "VERIFICACIÓN INTERNA" block: ${blockOK ? '✅' : '🔴'}`);

  if (blockOK) {
    const excerpt = prompt.split('VERIFICACIÓN INTERNA')[1].split('\n\n')[0];
    console.log('\nBlock excerpt:');
    console.log('  VERIFICACIÓN INTERNA' + excerpt.slice(0, 300) + '…');
  } else {
    console.log('Prompt tail (last 500 chars):', prompt.slice(-500));
  }

  // Restore
  await s.from('organizations').update({ owner_passphrase: priorPassphrase }).eq('portal_email', PORTAL_EMAIL);
  console.log('\nRestored prior passphrase.');
}
main().catch(err => { console.error(err); process.exit(1); });
