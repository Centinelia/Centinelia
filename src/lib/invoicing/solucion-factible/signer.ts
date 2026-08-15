import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';

// Hand-coded cadena original generator for CFDI 4.0 root elements.
// SAT publishes an XSLT 2.0 stylesheet with remote xsl:includes for
// complementos — no JS XSLT lib we can run on Vercel handles both, so we
// build the cadena directly from the parsed XML. Covers the base CFDI 4.0
// path (Comprobante + Emisor + Receptor + Conceptos + Impuestos). Extend
// per complemento if we ever emit them (nomina, pagos, cartaporte, etc).

const PARSER = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });

function pipe(...parts: (string | null | undefined)[]): string {
  // Cadena original: fields separated by |, missing optional fields still get their pipe.
  return parts.map(p => (p == null ? '' : String(p))).join('|');
}

function toArr<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export async function computeCadenaOriginal(xml: string): Promise<string> {
  const doc = PARSER.parse(xml);
  const c = doc['cfdi:Comprobante'];
  if (!c) throw new Error('cadena original: cfdi:Comprobante no encontrado');

  const emisor = c['cfdi:Emisor'] ?? {};
  const receptor = c['cfdi:Receptor'] ?? {};
  const conceptos = toArr(c['cfdi:Conceptos']?.['cfdi:Concepto']);
  const impuestos = c['cfdi:Impuestos'];

  const parts: (string | null)[] = [
    c['@Version'],
    c['@Serie'] ?? null,
    c['@Folio'] ?? null,
    c['@Fecha'],
    c['@FormaPago'] ?? null,
    c['@NoCertificado'],
    c['@SubTotal'],
    c['@Descuento'] ?? null,
    c['@Moneda'],
    c['@TipoCambio'] ?? null,
    c['@Total'],
    c['@TipoDeComprobante'],
    c['@Exportacion'],
    c['@MetodoPago'] ?? null,
    c['@LugarExpedicion'],
    c['@Confirmacion'] ?? null,
  ];

  // CfdiRelacionados* (skipped — not emitted by builder yet)

  // Emisor
  parts.push(
    emisor['@Rfc'],
    emisor['@Nombre'] ?? null,
    emisor['@RegimenFiscal'],
    emisor['@FacAtrAdquirente'] ?? null,
  );

  // Receptor
  parts.push(
    receptor['@Rfc'],
    receptor['@Nombre'] ?? null,
    receptor['@DomicilioFiscalReceptor'],
    receptor['@ResidenciaFiscal'] ?? null,
    receptor['@NumRegIdTrib'] ?? null,
    receptor['@RegimenFiscalReceptor'],
    receptor['@UsoCFDI'],
  );

  // Conceptos
  for (const con of conceptos) {
    parts.push(
      con['@ClaveProdServ'],
      con['@NoIdentificacion'] ?? null,
      con['@Cantidad'],
      con['@ClaveUnidad'],
      con['@Unidad'] ?? null,
      con['@Descripcion'],
      con['@ValorUnitario'],
      con['@Importe'],
      con['@Descuento'] ?? null,
      con['@ObjetoImp'],
    );
    // Concepto.Impuestos.Traslados/Retenciones
    const conImp = con['cfdi:Impuestos'];
    if (conImp) {
      for (const t of toArr(conImp['cfdi:Traslados']?.['cfdi:Traslado'])) {
        parts.push(t['@Base'], t['@Impuesto'], t['@TipoFactor'], t['@TasaOCuota'] ?? null, t['@Importe'] ?? null);
      }
      for (const r of toArr(conImp['cfdi:Retenciones']?.['cfdi:Retencion'])) {
        parts.push(r['@Base'], r['@Impuesto'], r['@TipoFactor'], r['@TasaOCuota'] ?? null, r['@Importe'] ?? null);
      }
    }
  }

  // Impuestos root
  if (impuestos) {
    for (const r of toArr(impuestos['cfdi:Retenciones']?.['cfdi:Retencion'])) {
      parts.push(r['@Impuesto'], r['@Importe']);
    }
    for (const t of toArr(impuestos['cfdi:Traslados']?.['cfdi:Traslado'])) {
      parts.push(t['@Base'], t['@Impuesto'], t['@TipoFactor'], t['@TasaOCuota'] ?? null, t['@Importe'] ?? null);
    }
    if (impuestos['@TotalImpuestosTrasladados'] != null) parts.push(impuestos['@TotalImpuestosTrasladados']);
    if (impuestos['@TotalImpuestosRetenidos'] != null) parts.push(impuestos['@TotalImpuestosRetenidos']);
  }

  // Format: ||field|field|...|field||
  return `||${pipe(...parts)}||`;
}

function stripPemHeaders(pem: string): string {
  return pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
}

export async function signXml(
  xml: string,
  csd: { cerPem: string; keyPem: string; noCertificado: string },
): Promise<string> {
  // 1. Insert NoCertificado + Certificado ANTES de calcular cadena (afecta cadena)
  const certB64 = stripPemHeaders(csd.cerPem);
  const withCert = xml
    .replace(/NoCertificado=""/, `NoCertificado="${csd.noCertificado}"`)
    .replace(/Certificado=""/, `Certificado="${certB64}"`);

  // 2. Cadena original
  const cadena = await computeCadenaOriginal(withCert);

  // 3. Firmar cadena SHA256withRSA
  const md = forge.md.sha256.create();
  md.update(cadena, 'utf8');
  const key = forge.pki.privateKeyFromPem(csd.keyPem);
  const sigBytes = key.sign(md);
  const selloB64 = forge.util.encode64(sigBytes);

  // 4. Insert Sello
  return withCert.replace(/Sello=""/, `Sello="${selloB64}"`);
}
