// Prep script para test manual del flow /setup con OTP.
// Uso: `npx dotenv-cli -e .env.local -- node scripts/test-setup-otp.mjs prep`
//      `npx dotenv-cli -e .env.local -- node scripts/test-setup-otp.mjs cleanup`
//
// prep    → asegura Nia@centinelia.dev sin password + inyecta código "123456"
// cleanup → borra el password que se pudo haber seteado + limpia códigos

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const EMAIL = 'centinelia.dev@gmail.com';
const CODE  = '123456';
const HASH  = createHash('sha256').update(CODE).digest('hex');

async function prep() {
  await supabase.from('voice_agents')
    .update({ portal_password_hash: null })
    .eq('portal_email', EMAIL);

  await supabase.from('portal_setup_codes')
    .delete().eq('portal_email', EMAIL);

  const { error } = await supabase.from('portal_setup_codes').insert({
    portal_email: EMAIL,
    code_hash:    HASH,
    expires_at:   new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  console.log(`prep OK: email=${EMAIL}, code=${CODE}, hash=${HASH.slice(0,12)}...`);
}

async function cleanup() {
  await supabase.from('voice_agents')
    .update({ portal_password_hash: null })
    .eq('portal_email', EMAIL);

  await supabase.from('portal_setup_codes')
    .delete().eq('portal_email', EMAIL);

  console.log('cleanup OK');
}

async function status() {
  const { data: agents } = await supabase.from('voice_agents')
    .select('agent_name, portal_password_hash')
    .eq('portal_email', EMAIL);
  const { data: codes } = await supabase.from('portal_setup_codes')
    .select('id, attempts, used_at, expires_at')
    .eq('portal_email', EMAIL).order('created_at', { ascending: false });
  console.log('agents:', agents?.map(a => ({ name: a.agent_name, has_pw: !!a.portal_password_hash })));
  console.log('codes:',  codes);
}

const cmd = process.argv[2];
if (cmd === 'prep')    await prep();
else if (cmd === 'cleanup') await cleanup();
else if (cmd === 'status')  await status();
else { console.error('usage: prep | cleanup | status'); process.exit(1); }
