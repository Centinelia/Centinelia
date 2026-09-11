import { createClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { config } from 'dotenv';

config({ path: '.env.local' });

const PORTAL_EMAIL = 'meefi-demo@centinelia.mx';
const PASSWORD = process.argv[2];

if (!PASSWORD) {
  console.error('Uso: node scripts/meefi/set-portal-password.mjs <password>');
  process.exit(1);
}

function u8ToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const keyMat = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    256,
  );
  return `${u8ToB64url(salt)}.${u8ToB64url(new Uint8Array(bits))}`;
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const hash = await hashPassword(PASSWORD);
console.log(`Hash generado (formato salt.hash): ${hash.slice(0, 20)}...`);

const { data, error } = await supabase
  .from('organizations')
  .update({ portal_password_hash: hash })
  .eq('portal_email', PORTAL_EMAIL)
  .select('portal_email, portal_token');

if (error) {
  console.error('ERROR:', error);
  process.exit(1);
}

if (!data || data.length === 0) {
  console.error(`No se encontró org con portal_email=${PORTAL_EMAIL}`);
  process.exit(1);
}

console.log(`\nOK. Portal Meefi ahora acepta login:`);
console.log(`  URL:      https://www.centinelia.mx/portal/login`);
console.log(`  Correo:   ${data[0].portal_email}`);
console.log(`  Password: ${PASSWORD}`);
console.log(`  Token URL: /portal/${data[0].portal_token}/...`);
