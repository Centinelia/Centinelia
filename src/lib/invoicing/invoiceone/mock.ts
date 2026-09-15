// Mock mode para InvoiceOne EasyOne.
//
// Se activa cuando:
//   - Env var INVOICEONE_MOCK === 'true', o
//   - Credenciales usuario === 'demo' o password === 'demo'
//
// Uso: piloto/demo con IPark antes de recibir credenciales sandbox reales de
// InvoiceOne. Genera UUID, sello y XML timbrado plausibles para que el flow
// end-to-end (Nala recibe correo → extrae datos → timbra → responde con CFDI
// adjunto) sea demo-able sin CSD ni cuenta InvoiceOne real.
//
// Cuando lleguen credenciales reales, este mock queda como fallback dev y el
// código de producción usa la ruta SOAP real en index.ts.

import { randomUUID } from 'node:crypto';
import type { CfdiInput, PagoInput, StampResult } from '../provider';

export function isMockMode(usuario: string, password: string): boolean {
  if (process.env.INVOICEONE_MOCK === 'true') return true;
  if (usuario === 'demo' || password === 'demo') return true;
  if (usuario === 'mock' || password === 'mock') return true;
  return false;
}

function randomBase64(bytes: number): string {
  const buf = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

function fakeSatCertNumber(): string {
  // 20 dígitos, formato certificado SAT
  let s = '';
  for (let i = 0; i < 20; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

async function generateQrPng(content: string): Promise<Buffer> {
  const { toBuffer } = await import('qrcode');
  return toBuffer(content, { type: 'png', width: 300, margin: 1 });
}

function nowIsoNoMs(): string {
  return new Date().toISOString().slice(0, 19);
}

function conceptosXml(conceptos: CfdiInput['conceptos']): string {
  return conceptos.map(c => {
    const iva = c.iva ?? 0;
    return `    <cfdi:Concepto ClaveProdServ="${c.claveProdServ}" ClaveUnidad="${c.claveUnidad}" Cantidad="${c.cantidad}" Descripcion="${escapeXml(c.descripcion)}" ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${c.importe.toFixed(2)}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${c.importe.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
  }).join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildMockTimbradoXml(cfdi: CfdiInput, uuid: string, fechaTimbrado: string, selloSat: string, noCertSat: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="DEMO" Folio="${Math.floor(Math.random()*99999)}" Fecha="${nowIsoNoMs()}" FormaPago="${cfdi.formaPago}" NoCertificado="${cfdi.csd.noCertificado || '00000000000000000000'}" SubTotal="${cfdi.subtotal.toFixed(2)}" Moneda="${cfdi.moneda}" Total="${cfdi.total.toFixed(2)}" TipoDeComprobante="I" MetodoPago="${cfdi.metodoPago}" LugarExpedicion="${cfdi.lugarExpedicion}" Exportacion="01">
  <cfdi:Emisor Rfc="${cfdi.emisor.rfc}" Nombre="${escapeXml(cfdi.emisor.nombre)}" RegimenFiscal="${cfdi.emisor.regimenFiscal}"/>
  <cfdi:Receptor Rfc="${cfdi.receptor.rfc}" Nombre="${escapeXml(cfdi.receptor.nombre)}" DomicilioFiscalReceptor="${cfdi.receptor.domicilioFiscal}" RegimenFiscalReceptor="${cfdi.receptor.regimenFiscal}" UsoCFDI="${cfdi.receptor.usoCfdi}"/>
  <cfdi:Conceptos>
${conceptosXml(cfdi.conceptos)}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${cfdi.iva.toFixed(2)}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${cfdi.subtotal.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${cfdi.iva.toFixed(2)}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaTimbrado}" RfcProvCertif="IIN190617PN2" SelloCFD="${randomBase64(256)}" NoCertificadoSAT="${noCertSat}" SelloSAT="${selloSat}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

export async function mockTimbrar(cfdi: CfdiInput): Promise<StampResult> {
  const uuid          = randomUUID().toUpperCase();
  const fechaTimbrado = nowIsoNoMs();
  const selloSat      = randomBase64(256);
  const noCertSat     = fakeSatCertNumber();
  const xmlTimbrado   = Buffer.from(buildMockTimbradoXml(cfdi, uuid, fechaTimbrado, selloSat, noCertSat), 'utf8');
  const fe            = selloSat.slice(-8);
  const qrContent     = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${cfdi.emisor.rfc}&rr=${cfdi.receptor.rfc}&tt=${cfdi.total.toFixed(2)}&fe=${fe}`;
  const qrPng         = await generateQrPng(qrContent);

  return {
    ok: true,
    uuid,
    selloSat,
    certificadoSat: noCertSat,
    fechaTimbrado,
    cadenaOriginal: `||1.1|${uuid}|${fechaTimbrado}|IIN190617PN2|${randomBase64(64)}|${noCertSat}||`,
    xmlTimbrado,
    qrPng,
    providerRef: `MOCK-${uuid.slice(0, 8)}`,
  };
}

export async function mockTimbrarPago(_pago: PagoInput): Promise<StampResult> {
  return {
    ok: false,
    code: 501,
    message: 'InvoiceOne mock: timbrarPago no simulado en demo (REP requiere flow real cliente-cliente)',
    retryable: false,
  };
}
