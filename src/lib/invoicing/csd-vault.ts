import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error('ENCRYPTION_KEY no configurada');
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error(`ENCRYPTION_KEY debe ser 32 bytes hex, recibí ${buf.length}`);
  return buf;
}

export function encryptBlob(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptBlob(cipher: Buffer): Buffer {
  if (cipher.length < IV_BYTES + TAG_BYTES) throw new Error('cipher demasiado corto');
  const iv = cipher.subarray(0, IV_BYTES);
  const tag = cipher.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = cipher.subarray(IV_BYTES + TAG_BYTES);
  const dec = createDecipheriv(ALG, key(), iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]);
}

export function encryptString(s: string): string {
  return encryptBlob(Buffer.from(s, 'utf8')).toString('base64');
}

export function decryptString(b64: string): string {
  return decryptBlob(Buffer.from(b64, 'base64')).toString('utf8');
}
