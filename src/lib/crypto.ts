import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? '';
  if (hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return Buffer.from(hex, 'hex');
}

// Format on disk: base64( iv[12] + authTag[16] + ciphertext )
export function encrypt(plaintext: string): string {
  const key    = getKey();
  const iv     = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  try {
    const key    = getKey();
    const buf    = Buffer.from(ciphertext, 'base64');
    if (buf.length < 29) throw new Error('too short');
    const iv     = buf.subarray(0, 12);
    const tag    = buf.subarray(12, 28);
    const data   = buf.subarray(28);
    const dc     = createDecipheriv(ALG, key, iv);
    dc.setAuthTag(tag);
    return Buffer.concat([dc.update(data), dc.final()]).toString('utf8');
  } catch {
    // Fallback: value was stored before encryption was enabled
    return ciphertext;
  }
}
