// src/lib/invoicing/solucion-factible/index.ts
import { XMLParser } from 'fast-xml-parser';
import type {
  InvoicingProvider, CfdiInput, StampResult, TimbrarOpts,
  CancelMotivo, CancelSubmitResult, CancelStatus, CancelOpts,
} from '../provider';
import { buildCfdiXml } from './xml-builder';
import { signXml } from './signer';
import {
  soapCall, buildTimbrarEnvelope, buildCancelarEnvelope, buildConsultarEstatusEnvelope,
} from './soap-client';
import { mapSfError } from '../error-mapping';

const ENDPOINTS = {
  timbrado: {
    test: 'https://testing.solucionfactible.com/ws/services/Timbrado',
    prod: 'https://solucionfactible.com/ws/services/Timbrado',
  },
  cancelacion: {
    test: 'https://testing.solucionfactible.com/ws/services/Cancelacion',
    prod: 'https://solucionfactible.com/ws/services/Cancelacion',
  },
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true });

function extractResultado(soapXml: string): { status: number; mensaje: string; resultado?: Record<string, unknown> } {
  const parsed = parser.parse(soapXml);
  const body = parsed?.Envelope?.Body ?? {};
  const respKey = Object.keys(body).find(k => k.endsWith('Response')) ?? '';
  const ret = (body[respKey] as Record<string, unknown> | undefined)?.return as Record<string, unknown> | undefined;
  if (!ret) throw new Error(`Respuesta SF sin <return>: ${soapXml.slice(0, 300)}`);
  const status = Number(ret.status);
  const mensaje = String(ret.mensaje ?? '');
  const resultados = (ret.resultados as Record<string, unknown> | undefined) ?? undefined;
  return { status, mensaje, resultado: resultados };
}

async function generateQrPng(cadena: string): Promise<Buffer> {
  const { toBuffer } = await import('qrcode');
  return toBuffer(cadena, { type: 'png', width: 300, margin: 1 });
}

export class SolucionFactibleProvider implements InvoicingProvider {
  async timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult> {
    const xmlUnsigned = buildCfdiXml(cfdi);
    const xmlSigned = signXml(xmlUnsigned, cfdi.csd);
    const envelope = buildTimbrarEnvelope(cfdi.pacCredentials.usuario, cfdi.pacCredentials.password, xmlSigned);
    const url = opts.testMode ? ENDPOINTS.timbrado.test : ENDPOINTS.timbrado.prod;
    const { xml: soapResp } = await soapCall(url, 'timbrarBase64', envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje, resultado } = extractResultado(soapResp);

    if (status !== 200) {
      const info = mapSfError(status);
      return { ok: false, code: status, message: mensaje, retryable: info.retryable };
    }

    const r = resultado ?? {};
    const uuid = String(r.uuid ?? '');
    const selloSat = String(r.selloSAT ?? '');
    const certificadoSat = String(r.certificadoSAT ?? '');
    const fechaTimbrado = String(r.fechaTimbrado ?? '');
    const cadenaOriginal = String(r.cadenaOriginal ?? '');
    const cfdiTimbradoB64 = String(r.cfdiTimbrado ?? '');
    if (!uuid || !cfdiTimbradoB64) {
      return { ok: false, code: 500, message: 'Respuesta SF sin uuid/cfdiTimbrado', retryable: false };
    }

    const xmlTimbrado = Buffer.from(cfdiTimbradoB64, 'base64');
    const qrPng = await generateQrPng(cadenaOriginal || uuid);
    return { ok: true, uuid, selloSat, certificadoSat, fechaTimbrado, cadenaOriginal, xmlTimbrado, qrPng };
  }

  async cancelar(
    uuid: string, motivo: CancelMotivo, uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    _csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult> {
    const envelope = buildCancelarEnvelope(creds.usuario, creds.password, uuid, motivo, uuidSustituto);
    const url = opts.testMode ? ENDPOINTS.cancelacion.test : ENDPOINTS.cancelacion.prod;
    const { xml } = await soapCall(url, 'cancelarAsincrono', envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje } = extractResultado(xml);
    if (status !== 200) return { status: 'rejected', code: status, message: mensaje };
    return { status: 'sent_to_sat', message: mensaje };
  }

  async consultarEstatusCancelacion(
    uuid: string, creds: { usuario: string; password: string }, opts: CancelOpts,
  ): Promise<CancelStatus> {
    const envelope = buildConsultarEstatusEnvelope(creds.usuario, creds.password, uuid);
    const url = opts.testMode ? ENDPOINTS.cancelacion.test : ENDPOINTS.cancelacion.prod;
    const { xml } = await soapCall(url, 'getStatusCancelacionAsincrona', envelope, opts.timeoutMs ?? 30000);
    const { status, mensaje, resultado } = extractResultado(xml);
    // Mapeo: SF devuelve status con mensajes tipo "Cancelado", "En proceso", "No cancelable"
    const acuse = resultado?.acuseXml ? Buffer.from(String(resultado.acuseXml), 'base64') : undefined;
    if (status === 200 && /cancel/i.test(mensaje)) return { status: 'accepted', acuseXml: acuse, message: mensaje };
    if (status === 200 && /proceso/i.test(mensaje)) return { status: 'pending', message: mensaje };
    if (/no cancelable/i.test(mensaje) || /rechaz/i.test(mensaje)) return { status: 'rejected', message: mensaje };
    if (/plazo/i.test(mensaje) || /expir/i.test(mensaje)) return { status: 'expired', message: mensaje };
    return { status: 'pending', message: mensaje };
  }
}

export const solucionFactibleProvider = new SolucionFactibleProvider();
