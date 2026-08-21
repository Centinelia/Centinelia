/**
 * Cifra un dropbox_token en plaintext usando la ENCRYPTION_KEY del entorno,
 * imprimiendo el ciphertext base64 listo para pegarse en el JSONB `config`
 * de `organization_integrations`.
 *
 * Uso:
 *   npx tsx scripts/encrypt-dropbox-token.ts "sl.AbCdEfGhIjKlMn..."
 *
 * Requiere `ENCRYPTION_KEY` en `.env.local` (32 bytes hex = 64 chars).
 * El script imprime SOLO el ciphertext a stdout para poder pipearlo.
 * Los mensajes informativos van a stderr.
 */
import './_bootstrap';
import { encryptDropboxToken } from '@/lib/billing/adapters';

const plaintext = process.argv[2];

if (!plaintext) {
  console.error('uso: npx tsx scripts/encrypt-dropbox-token.ts "<token-plaintext>"');
  process.exit(1);
}

if (!plaintext.startsWith('sl.')) {
  console.error('warning: token no empieza con "sl." — es posible que no sea un Dropbox App token válido.');
}

try {
  const ciphertext = encryptDropboxToken(plaintext);
  console.error(`ok: cifrado ${plaintext.length} chars → ${ciphertext.length} chars base64`);
  console.log(ciphertext);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`error al cifrar: ${msg}`);
  process.exit(2);
}
