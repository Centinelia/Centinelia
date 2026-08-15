import { describe, it, expect, beforeAll } from 'vitest';
import { encryptBlob, decryptBlob, encryptString, decryptString } from '../csd-vault';
import { randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseCsd } from '../csd-vault';

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

const CSD_DIR = join(process.cwd(), 'fixtures', 'sat-test-csd');
const CSD_CER = join(CSD_DIR, 'EKU9003173C9.cer');
const CSD_KEY = join(CSD_DIR, 'EKU9003173C9.key');
const CSD_PW  = join(CSD_DIR, 'PASSWORD.txt');
const CSD_FIXTURES_AVAILABLE = existsSync(CSD_CER) && existsSync(CSD_KEY) && existsSync(CSD_PW);

describe.skipIf(!CSD_FIXTURES_AVAILABLE)('parseCsd', () => {
  let cer: Buffer;
  let key: Buffer;
  let pw: string;

  beforeAll(() => {
    cer = readFileSync(CSD_CER);
    key = readFileSync(CSD_KEY);
    pw  = readFileSync(CSD_PW, 'utf8').trim();
  });

  it('extrae RFC EKU9003173C9 del cert', () => {
    const parsed = parseCsd(cer, key, pw);
    expect(parsed.rfc).toBe('EKU9003173C9');
    expect(parsed.noCertificado).toMatch(/^\d{20}$/);
    expect(parsed.notAfter).toBeInstanceOf(Date);
    expect(parsed.cerPem).toMatch(/-----BEGIN CERTIFICATE-----/);
    expect(parsed.keyPem).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
  });

  it('password incorrecta lanza error legible', () => {
    expect(() => parseCsd(cer, key, 'wrong-password')).toThrow(/password/i);
  });
});
