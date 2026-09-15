// InvoiceOne EasyOne PAC provider (SOAP).
//
// PAC autorizado SAT — usado por IPark Estacionamientos entre otros. Setup:
//
//   1. IPark (o cliente) da su usuario/password EasyOne por config del portal.
//   2. Adapter firma CFDI con CSD del cliente (guardado en organizations.
//      invoicing_csd_*) y envía a InvoiceOne via SOAP.
//   3. InvoiceOne responde con XML timbrado (incluye TFD del SAT).
//
// Modo mock (para demos/piloto pre-credenciales):
//   - env INVOICEONE_MOCK=true, o
//   - pacCredentials.usuario === 'demo' / password === 'demo'
//   Retorna respuestas plausibles sin llamar InvoiceOne. Ver ./mock.ts.
//
// TODOs para promover a prod:
//   [ ] Recibir WSDL de InvoiceOne (email o support portal).
//   [ ] Confirmar namespaces reales de NS_TIMBRADO / NS_CANCELACION en soap-client.ts.
//   [ ] Confirmar nombres exactos de métodos (ObtenerCFDI vs otras variantes).
//   [ ] Confirmar URLs de sandbox y prod → INVOICEONE_TIMBRADO_TEST_URL etc en .env.
//   [ ] Wire firma XML (importar signer de SF o construir uno propio si InvoiceOne acepta unsigned).
//   [ ] Correr un timbrado real sandbox end-to-end antes de flippear cliente a prod.

import { XMLParser } from 'fast-xml-parser';
import type {
  InvoicingProvider, CfdiInput, StampResult, TimbrarOpts,
  CancelMotivo, CancelSubmitResult, CancelStatus, CancelOpts, PagoInput,
} from '../provider';
import {
  buildTimbrarEnvelope, buildCancelarEnvelope, buildConsultarEstatusEnvelope,
  soapCall, DEFAULT_ENDPOINTS,
} from './soap-client';
import { isMockMode, mockTimbrar, mockTimbrarPago } from './mock';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });

interface ParsedResult {
  status: number;
  mensaje: string;
  uuid?: string;
  cfdiTimbradoB64?: string;
  selloSat?: string;
  certificadoSat?: string;
  fechaTimbrado?: string;
  cadenaOriginal?: string;
}

function extractResultado(soapXml: string): ParsedResult {
  const parsed = parser.parse(soapXml);
  const body = (parsed?.Envelope?.Body ?? {}) as Record<string, unknown>;
  const respKey = Object.keys(body).find(k => k.endsWith('Response') || k.endsWith('ResponsePrueba')) ?? '';
  const resp = (body[respKey] ?? {}) as Record<string, unknown>;
  const ret  = (resp.return ?? resp[`${respKey}Result`] ?? resp) as Record<string, unknown>;

  const status  = Number(ret.status ?? ret.Codigo ?? ret.codigo ?? 500);
  const mensaje = String(ret.mensaje ?? ret.Mensaje ?? ret.mensajeCodigo ?? '');
  const uuid    = ret.uuid ? String(ret.uuid) : (ret.UUID ? String(ret.UUID) : undefined);
  const cfdiB64 = ret.cfdiTimbrado
    ? String(ret.cfdiTimbrado)
    : (ret.xmlTimbrado ? String(ret.xmlTimbrado) : undefined);

  return {
    status, mensaje, uuid,
    cfdiTimbradoB64: cfdiB64,
    selloSat:        ret.selloSAT ? String(ret.selloSAT) : undefined,
    certificadoSat:  ret.certificadoSAT ? String(ret.certificadoSAT) : undefined,
    fechaTimbrado:   ret.fechaTimbrado ? String(ret.fechaTimbrado) : undefined,
    cadenaOriginal:  ret.cadenaOriginal ? String(ret.cadenaOriginal) : undefined,
  };
}

async function generateQrPng(cadena: string): Promise<Buffer> {
  const { toBuffer } = await import('qrcode');
  return toBuffer(cadena, { type: 'png', width: 300, margin: 1 });
}

export class InvoiceOneProvider implements InvoicingProvider {
  async timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult> {
    if (isMockMode(cfdi.pacCredentials.usuario, cfdi.pacCredentials.password)) {
      return mockTimbrar(cfdi);
    }

    // Ruta real (post-credenciales InvoiceOne).
    // NOTA: InvoiceOne acepta CFDI ya firmado con CSD del emisor. Firma va
    // aquí una vez que confirmemos si InvoiceOne firma server-side o requiere
    // pre-signed. Por ahora asumimos pre-signed (patrón SF).
    //
    // TODO: importar signer una vez confirmado con InvoiceOne cómo esperan
    // el CFDI (firmado por cliente vs firmado por InvoiceOne server-side).
    // Del catálogo de PACs mexicanos ambos patrones existen.
    const signedXml = buildUnsignedCfdiXml(cfdi); // placeholder — se firma cuando llegue creds
    const envelope = buildTimbrarEnvelope(
      cfdi.pacCredentials.usuario, cfdi.pacCredentials.password, signedXml, opts.testMode,
    );
    const url = opts.testMode ? DEFAULT_ENDPOINTS.timbrado.test : DEFAULT_ENDPOINTS.timbrado.prod;
    const action = opts.testMode ? 'ObtenerCFDIPrueba' : 'ObtenerCFDI';

    const { status: httpStatus, xml: soapResp } = await soapCall(
      url, action, envelope, opts.timeoutMs ?? 30000,
    );

    if (httpStatus < 200 || httpStatus >= 300) {
      return { ok: false, code: httpStatus, message: `InvoiceOne HTTP ${httpStatus}`, retryable: httpStatus >= 500 };
    }

    const parsed = extractResultado(soapResp);
    if (parsed.status !== 200 || !parsed.uuid || !parsed.cfdiTimbradoB64) {
      return {
        ok: false,
        code: parsed.status || 500,
        message: parsed.mensaje || 'Respuesta InvoiceOne sin uuid/cfdiTimbrado',
        retryable: parsed.status >= 500,
      };
    }

    const xmlTimbrado = Buffer.from(parsed.cfdiTimbradoB64, 'base64');
    const selloSat = parsed.selloSat ?? '';
    const fe = selloSat.slice(-8);
    const qrContent = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${parsed.uuid}&re=${cfdi.emisor.rfc}&rr=${cfdi.receptor.rfc}&tt=${cfdi.total.toFixed(2)}&fe=${fe}`;
    const qrPng = await generateQrPng(qrContent);

    return {
      ok: true,
      uuid:           parsed.uuid,
      selloSat,
      certificadoSat: parsed.certificadoSat ?? '',
      fechaTimbrado:  parsed.fechaTimbrado ?? new Date().toISOString().slice(0, 19),
      cadenaOriginal: parsed.cadenaOriginal ?? '',
      xmlTimbrado,
      qrPng,
    };
  }

  async timbrarPago(pago: PagoInput, _opts: TimbrarOpts): Promise<StampResult> {
    if (isMockMode(pago.pacCredentials.usuario, pago.pacCredentials.password)) {
      return mockTimbrarPago(pago);
    }
    return {
      ok: false, code: 501,
      message: 'InvoiceOne: timbrarPago (REP) no implementado todavía — configurar tras cerrar cliente que lo requiera.',
      retryable: false,
    };
  }

  async cancelar(
    uuid: string, motivo: CancelMotivo, uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    _csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult> {
    if (isMockMode(creds.usuario, creds.password)) {
      return { status: 'sent_to_sat', message: `Mock InvoiceOne: cancelación ${uuid} motivo ${motivo} encolada` };
    }
    const envelope = buildCancelarEnvelope(creds.usuario, creds.password, uuid, motivo, uuidSustituto, opts.testMode);
    const url = opts.testMode ? DEFAULT_ENDPOINTS.cancelacion.test : DEFAULT_ENDPOINTS.cancelacion.prod;
    const action = opts.testMode ? 'CancelarCFDIPrueba' : 'CancelarCFDI';
    const { xml } = await soapCall(url, action, envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje } = extractResultado(xml);
    if (status !== 200) return { status: 'rejected', code: status, message: mensaje };
    return { status: 'sent_to_sat', message: mensaje };
  }

  async consultarEstatusCancelacion(
    uuid: string, creds: { usuario: string; password: string }, opts: CancelOpts,
  ): Promise<CancelStatus> {
    if (isMockMode(creds.usuario, creds.password)) {
      return { status: 'accepted', message: 'Mock InvoiceOne: cancelación aceptada por SAT' };
    }
    const envelope = buildConsultarEstatusEnvelope(creds.usuario, creds.password, uuid, opts.testMode);
    const url = opts.testMode ? DEFAULT_ENDPOINTS.cancelacion.test : DEFAULT_ENDPOINTS.cancelacion.prod;
    const action = opts.testMode ? 'ConsultarEstatusCancelacionPrueba' : 'ConsultarEstatusCancelacion';
    const { xml } = await soapCall(url, action, envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje } = extractResultado(xml);
    if (status === 200 && /cancel/i.test(mensaje) && !/no cancel/i.test(mensaje)) return { status: 'accepted', message: mensaje };
    if (status === 200 && /proceso|pending/i.test(mensaje)) return { status: 'pending', message: mensaje };
    if (/no cancelable|rechaz/i.test(mensaje)) return { status: 'rejected', message: mensaje };
    if (/plazo|expir/i.test(mensaje)) return { status: 'expired', message: mensaje };
    return { status: 'pending', message: mensaje };
  }
}

// Builder unsigned CFDI 4.0 (placeholder — se reemplaza por reuse de SF
// xml-builder o builder propio cuando InvoiceOne confirme si acepta unsigned
// vs. requiere firma cliente).
function buildUnsignedCfdiXml(cfdi: CfdiInput): string {
  const conceptos = cfdi.conceptos.map(c => `    <cfdi:Concepto ClaveProdServ="${c.claveProdServ}" ClaveUnidad="${c.claveUnidad}" Cantidad="${c.cantidad}" Descripcion="${xmlEsc(c.descripcion)}" ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${c.importe.toFixed(2)}" ObjetoImp="02"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="${new Date().toISOString().slice(0,19)}" FormaPago="${cfdi.formaPago}" NoCertificado="${cfdi.csd.noCertificado}" SubTotal="${cfdi.subtotal.toFixed(2)}" Moneda="${cfdi.moneda}" Total="${cfdi.total.toFixed(2)}" TipoDeComprobante="I" MetodoPago="${cfdi.metodoPago}" LugarExpedicion="${cfdi.lugarExpedicion}" Exportacion="01">
  <cfdi:Emisor Rfc="${cfdi.emisor.rfc}" Nombre="${xmlEsc(cfdi.emisor.nombre)}" RegimenFiscal="${cfdi.emisor.regimenFiscal}"/>
  <cfdi:Receptor Rfc="${cfdi.receptor.rfc}" Nombre="${xmlEsc(cfdi.receptor.nombre)}" DomicilioFiscalReceptor="${cfdi.receptor.domicilioFiscal}" RegimenFiscalReceptor="${cfdi.receptor.regimenFiscal}" UsoCFDI="${cfdi.receptor.usoCfdi}"/>
  <cfdi:Conceptos>
${conceptos}
  </cfdi:Conceptos>
</cfdi:Comprobante>`;
}
function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const invoiceOneProvider = new InvoiceOneProvider();
