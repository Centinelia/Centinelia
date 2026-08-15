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

// ─── parseCsd ───────────────────────────────────────────────────────────────

import forge from 'node-forge';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ParsedCsd {
  cerPem: string;
  keyPem: string;
  rfc: string;
  noCertificado: string;
  notAfter: Date;
  notBefore: Date;
}

export function parseCsd(cerBuf: Buffer, keyBuf: Buffer, password: string): ParsedCsd {
  // 1. Parse cert (DER binary)
  const cerAsn1 = forge.asn1.fromDer(forge.util.createBuffer(cerBuf.toString('binary')));
  const cert = forge.pki.certificateFromAsn1(cerAsn1);
  const cerPem = forge.pki.certificateToPem(cert);

  // 2. Extract RFC from subject (x500UniqueIdentifier o serialNumber)
  const rfcAttr = cert.subject.attributes.find(a =>
    a.type === '2.5.4.45' || a.shortName === 'serialNumber' || a.name === 'x500UniqueIdentifier'
  );
  const rfcRaw = (rfcAttr?.value as string | undefined) ?? '';
  const rfc = rfcRaw.split(/[\s\/]/)[0].toUpperCase();
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
    throw new Error(`No pude extraer RFC del certificado. Encontré: "${rfcRaw}"`);
  }

  // 3. Serial (no. certificado SAT = 20 dígitos)
  const serialHex = cert.serialNumber;
  const noCertificado = Buffer.from(serialHex, 'hex').toString('ascii');
  if (!/^\d{20}$/.test(noCertificado)) {
    throw new Error(`Serial no es 20 dígitos: "${noCertificado}"`);
  }

  // 4. Parse encrypted PKCS#8 key
  let keyPem: string;
  try {
    const keyAsn1 = forge.asn1.fromDer(forge.util.createBuffer(keyBuf.toString('binary')));
    const keyObj = forge.pki.decryptRsaPrivateKey(forge.pki.encryptedPrivateKeyToPem(
      forge.pki.encryptedPrivateKeyFromAsn1(keyAsn1)
    ), password);
    if (!keyObj) throw new Error('password incorrecta');
    keyPem = forge.pki.privateKeyToPem(keyObj);
  } catch (err) {
    throw new Error(`No pude abrir el .key con la password proporcionada: ${(err as Error).message}`);
  }

  // 5. Validar par cert/key (public key match)
  const certPub = forge.pki.publicKeyToPem(cert.publicKey);
  const keyObj2 = forge.pki.privateKeyFromPem(keyPem);
  const derivedPub = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(keyObj2.n, keyObj2.e));
  if (certPub !== derivedPub) throw new Error('El .cer y .key no son del mismo par');

  return {
    cerPem, keyPem, rfc, noCertificado,
    notAfter: cert.validity.notAfter,
    notBefore: cert.validity.notBefore,
  };
}

// ─── Storage put/get ─────────────────────────────────────────────────────────

export interface StoredCsdPaths { cerPath: string; keyPath: string; }

export async function putCsd(
  orgEmail: string, cer: Buffer, key: Buffer, version: number, supabase: SupabaseClient
): Promise<StoredCsdPaths> {
  const cerPath = `${orgEmail}/${version}.cer.enc`;
  const keyPath = `${orgEmail}/${version}.key.enc`;
  const cerEnc = encryptBlob(cer);
  const keyEnc = encryptBlob(key);

  const up1 = await supabase.storage.from('csd').upload(cerPath, cerEnc, {
    contentType: 'application/octet-stream', upsert: true,
  });
  if (up1.error) throw new Error(`Storage upload .cer: ${up1.error.message}`);
  const up2 = await supabase.storage.from('csd').upload(keyPath, keyEnc, {
    contentType: 'application/octet-stream', upsert: true,
  });
  if (up2.error) throw new Error(`Storage upload .key: ${up2.error.message}`);

  return { cerPath, keyPath };
}

export interface LoadedCsd { cerPem: string; keyPem: string; noCertificado: string; }

export async function getCsd(orgEmail: string, supabase: SupabaseClient): Promise<LoadedCsd | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('invoicing_csd_cer_path, invoicing_csd_key_path, invoicing_csd_password_encrypted, invoicing_csd_no_certificado, invoicing_csd_expires_at')
    .eq('portal_email', orgEmail)
    .single();
  if (!org?.invoicing_csd_cer_path || !org.invoicing_csd_key_path || !org.invoicing_csd_password_encrypted) return null;

  // Vigencia (throw si expiró)
  if (org.invoicing_csd_expires_at && new Date(org.invoicing_csd_expires_at) < new Date()) {
    throw new Error('CSD expirado');
  }

  const [cerRes, keyRes] = await Promise.all([
    supabase.storage.from('csd').download(org.invoicing_csd_cer_path),
    supabase.storage.from('csd').download(org.invoicing_csd_key_path),
  ]);
  if (cerRes.error || !cerRes.data) throw new Error(`Storage download .cer: ${cerRes.error?.message}`);
  if (keyRes.error || !keyRes.data) throw new Error(`Storage download .key: ${keyRes.error?.message}`);

  const cerEnc = Buffer.from(await cerRes.data.arrayBuffer());
  const keyEnc = Buffer.from(await keyRes.data.arrayBuffer());
  const password = decryptString(org.invoicing_csd_password_encrypted);

  const parsed = parseCsd(decryptBlob(cerEnc), decryptBlob(keyEnc), password);
  return {
    cerPem: parsed.cerPem,
    keyPem: parsed.keyPem,
    noCertificado: org.invoicing_csd_no_certificado ?? parsed.noCertificado,
  };
}
