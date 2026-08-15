// src/lib/invoicing/solucion-factible/__tests__/signer.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import forge from 'node-forge';
import { buildCfdiXml } from '../xml-builder';
import { signXml, computeCadenaOriginal } from '../signer';
import { parseCsd } from '../../csd-vault';

const input = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures', 'cfdi-v4-sample-input.json'), 'utf8')
);

const CSD_DIR = join(process.cwd(), 'fixtures', 'sat-test-csd');
const CSD_CER = join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.cer');
const CSD_KEY = join(CSD_DIR, 'CSD_Prueba_CFDI_LAN7008173R5.key');
const CSD_PW  = join(CSD_DIR, 'PASSWORD.txt');
const CSD_FIXTURES_AVAILABLE = existsSync(CSD_CER) && existsSync(CSD_KEY) && existsSync(CSD_PW);

describe.skipIf(!CSD_FIXTURES_AVAILABLE)('signer', () => {
  let parsed: ReturnType<typeof parseCsd>;
  beforeAll(() => {
    parsed = parseCsd(
      readFileSync(CSD_CER),
      readFileSync(CSD_KEY),
      readFileSync(CSD_PW, 'utf8').trim(),
    );
  });

  it('computeCadenaOriginal empieza y termina con ||', () => {
    const xml = buildCfdiXml(input);
    const cadena = computeCadenaOriginal(xml);
    expect(cadena.startsWith('||')).toBe(true);
    expect(cadena.endsWith('||')).toBe(true);
    expect(cadena).toContain('|4.0|');
  });

  it('signXml rellena Sello, NoCertificado, Certificado', () => {
    const xml = buildCfdiXml(input);
    const signed = signXml(xml, parsed);
    const attrs = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })
      .parse(signed)['cfdi:Comprobante'];
    expect(attrs['@NoCertificado']).toBe(parsed.noCertificado);
    expect(attrs['@Certificado'].length).toBeGreaterThan(400);   // base64 sin headers
    expect(attrs['@Sello'].length).toBeGreaterThan(300);          // firma RSA base64
  });

  it('el sello verifica contra el public key del cert (SHA256withRSA)', () => {
    const xml = buildCfdiXml(input);
    const signed = signXml(xml, parsed);
    const attrs = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })
      .parse(signed)['cfdi:Comprobante'];
    const sello = attrs['@Sello'] as string;
    const cadena = computeCadenaOriginal(signed);
    const cert = forge.pki.certificateFromPem(parsed.cerPem);
    const md = forge.md.sha256.create();
    md.update(cadena, 'utf8');
    const sigBytes = forge.util.decode64(sello);
    const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().bytes(), sigBytes);
    expect(ok).toBe(true);
  });
});
