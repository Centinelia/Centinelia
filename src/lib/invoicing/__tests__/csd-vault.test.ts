import { describe, it, expect, beforeAll } from 'vitest';
import { encryptBlob, decryptBlob, encryptString, decryptString } from '../csd-vault';
import { randomBytes } from 'crypto';

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  }
});

describe('csd-vault crypto round-trip', () => {
  it('encryptBlob → decryptBlob recupera el blob original', () => {
    const plain = randomBytes(4096);
    const cipher = encryptBlob(plain);
    expect(cipher.length).toBe(12 + 16 + plain.length);
    const back = decryptBlob(cipher);
    expect(back.equals(plain)).toBe(true);
  });
  it('IVs distintos producen ciphertext distinto para el mismo plaintext', () => {
    const plain = Buffer.from('hola-mundo');
    const a = encryptBlob(plain);
    const b = encryptBlob(plain);
    expect(a.equals(b)).toBe(false);
  });
  it('decryptBlob con tag corrupto lanza', () => {
    const cipher = encryptBlob(Buffer.from('x'));
    cipher[15] = cipher[15] ^ 0xff;   // corrompe el tag
    expect(() => decryptBlob(cipher)).toThrow();
  });
  it('encryptString/decryptString round-trip', () => {
    const s = 'password-super-secreto-áéíóú';
    expect(decryptString(encryptString(s))).toBe(s);
  });
});
