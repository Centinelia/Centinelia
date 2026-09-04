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
  const key    = getKey();
  const buf    = Buffer.from(ciphertext, 'base64');
  if (buf.length < 29) {
    // Auditoría 2026-09-04: antes teníamos fallback silencioso `return ciphertext`
    // que enmascaraba migraciones incompletas (valores plaintext viviendo como
    // ciphertext). Ahora fallamos ruidosos. Si esto tira en prod, hay un valor
    // sin cifrar en BD que hay que migrar manualmente vía script.
    throw new Error(`decrypt: ciphertext too short (${buf.length} bytes) — posible valor sin cifrar en BD, migrar con encrypt(...)`);
  }
  const iv     = buf.subarray(0, 12);
  const tag    = buf.subarray(12, 28);
  const data   = buf.subarray(28);
  const dc     = createDecipheriv(ALG, key, iv);
  dc.setAuthTag(tag);
  return Buffer.concat([dc.update(data), dc.final()]).toString('utf8');
}

/**
 * Safe wrapper: decripta y loguea si detecta valor legacy sin cifrar. Devuelve
 * el ciphertext original si el decrypt falla — para callers que necesitan
 * degradación graceful mientras migramos (ej. adapter que puede seguir
 * funcionando con token viejo hasta que se re-encripte).
 *
 * Nueva llamada: usar decrypt() normal — el error tirado forzará a hacer
 * la migración explícita.
 */
export function decryptOrPassthrough(ciphertext: string): { value: string; wasEncrypted: boolean } {
  try {
    return { value: decrypt(ciphertext), wasEncrypted: true };
  } catch (err) {
    console.warn('[crypto] decrypt falló, tratando como plaintext legacy — migrar:',
      err instanceof Error ? err.message : String(err));
    return { value: ciphertext, wasEncrypted: false };
  }
}
