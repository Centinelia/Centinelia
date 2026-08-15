// src/lib/invoicing/solucion-factible/signer.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import forge from 'node-forge';
import { Xslt, XmlParser } from 'xslt-processor';

let XSLT_CACHE: string | null = null;
function xsltSource(): string {
  if (!XSLT_CACHE) {
    XSLT_CACHE = readFileSync(join(__dirname, 'cadena-original.xslt'), 'utf8');
  }
  return XSLT_CACHE;
}

export function computeCadenaOriginal(xml: string): string {
  const proc = new Xslt();
  const xmlDoc = new XmlParser().xmlParse(xml);
  const xsltDoc = new XmlParser().xmlParse(xsltSource());
  const result = proc.xsltProcess(xmlDoc, xsltDoc);
  return String(result).trim();
}

function stripPemHeaders(pem: string): string {
  return pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
}

export function signXml(
  xml: string,
  csd: { cerPem: string; keyPem: string; noCertificado: string },
): string {
  // 1. Insert NoCertificado + Certificado ANTES de calcular cadena (afecta cadena)
  const certB64 = stripPemHeaders(csd.cerPem);
  let withCert = xml
    .replace(/NoCertificado=""/, `NoCertificado="${csd.noCertificado}"`)
    .replace(/Certificado=""/, `Certificado="${certB64}"`);

  // 2. Cadena original con XSLT
  const cadena = computeCadenaOriginal(withCert);

  // 3. Firmar cadena SHA256withRSA
  const md = forge.md.sha256.create();
  md.update(cadena, 'utf8');
  const key = forge.pki.privateKeyFromPem(csd.keyPem);
  const sigBytes = key.sign(md);
  const selloB64 = forge.util.encode64(sigBytes);

  // 4. Insert Sello
  return withCert.replace(/Sello=""/, `Sello="${selloB64}"`);
}
