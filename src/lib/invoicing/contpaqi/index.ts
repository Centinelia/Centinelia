// CONTPAQi Timbra v3 provider (SCAFFOLD — pendiente de creds sandbox reales)
//
// Estado: implementación tentativa contra la doc pública de CONTPAQi Nube
// (developers.contpaqinube.com). El portal exige "administrator authorization"
// para exponer el detalle exacto de endpoints + auth. Cuando el cliente (o
// nosotros vía partner program) obtenga las creds:
//
//   1. Confirmar endpoints reales (posibles: /api/v3/timbrado, /api/v3/cancelacion)
//   2. Confirmar auth header exacto (posible: `Ocp-Apim-Subscription-Key` +
//      `Authorization: Bearer <token>`, patrón Azure API Management)
//   3. Confirmar shape response (aquí asumimos { status, uuid, selloSAT, ... })
//   4. Correr integration test análogo al de SF (test-gated con env var)
//   5. Cambiar enabled:true en PAC_CATALOG (SolucionFactibleSection.tsx)
//
// Env vars requeridas:
//   CONTPAQI_TIMBRA_ENDPOINT_TEST=https://sandbox.api.contpaqinube.com/timbra/v3
//   CONTPAQI_TIMBRA_ENDPOINT_PROD=https://api.contpaqinube.com/timbra/v3
//   CONTPAQI_TIMBRA_SUB_KEY=<Ocp-Apim-Subscription-Key del portal>
//
// A diferencia de SF (SOAP), CONTPAQi Timbra es REST/JSON. Lo bueno: la
// abstracción InvoicingProvider ya nos aisla — el orquestador emitirFacturaAuto
// no cambia. Solo cambia esta implementación interna.

import type {
  InvoicingProvider, CfdiInput, StampResult, TimbrarOpts,
  CancelMotivo, CancelSubmitResult, CancelStatus, CancelOpts, PagoInput,
} from '../provider';
import { buildCfdiXml } from '../solucion-factible/xml-builder';
import { signXml } from '../solucion-factible/signer';
import { mapContpaqiError } from './error-mapping';

const ENDPOINT = {
  test: process.env.CONTPAQI_TIMBRA_ENDPOINT_TEST ?? 'https://sandbox.api.contpaqinube.com/timbra/v3',
  prod: process.env.CONTPAQI_TIMBRA_ENDPOINT_PROD ?? 'https://api.contpaqinube.com/timbra/v3',
};

function baseHeaders(pacUser: string, pacPassword: string): Record<string, string> {
  // Assumption: Azure APIM Ocp-Apim-Subscription-Key para el producto Timbra +
  // Basic auth (user/pass) para la cuenta CONTPAQi específica. Ajustar cuando
  // tengamos la doc real.
  const subKey = process.env.CONTPAQI_TIMBRA_SUB_KEY;
  if (!subKey) throw new Error('CONTPAQI_TIMBRA_SUB_KEY no configurada');
  return {
    'Content-Type':               'application/json',
    'Accept':                     'application/json',
    'Ocp-Apim-Subscription-Key':  subKey,
    'Authorization':              `Basic ${Buffer.from(`${pacUser}:${pacPassword}`).toString('base64')}`,
  };
}

async function jsonCall(url: string, method: string, headers: Record<string, string>, body?: unknown, timeoutMs = 30000)
: Promise<{ status: number; json: unknown; raw: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { /* return raw only */ }
    return { status: res.status, json: parsed, raw };
  } finally { clearTimeout(t); }
}

async function generateQrPng(content: string): Promise<Buffer> {
  const { toBuffer } = await import('qrcode');
  return toBuffer(content, { type: 'png', width: 300, margin: 1 });
}

export class ContpaqiTimbraProvider implements InvoicingProvider {
  async timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult> {
    const xmlUnsigned = buildCfdiXml(cfdi);
    const xmlSigned = await signXml(xmlUnsigned, cfdi.csd);
    const xmlB64 = Buffer.from(xmlSigned, 'utf8').toString('base64');

    const url = `${opts.testMode ? ENDPOINT.test : ENDPOINT.prod}/timbrar`;
    const { status, json } = await jsonCall(
      url, 'POST',
      baseHeaders(cfdi.pacCredentials.usuario, cfdi.pacCredentials.password),
      { cfdiBase64: xmlB64 },
      opts.timeoutMs ?? 30000,
    );

    const r = (json ?? {}) as Record<string, unknown>;
    const respStatus = Number(r.status ?? status);
    if (respStatus !== 200) {
      const info = mapContpaqiError(respStatus);
      return { ok: false, code: respStatus, message: String(r.mensaje ?? r.message ?? ''), retryable: info.retryable };
    }

    // Assumption: response shape aligned con SF por consistencia. Ajustar cuando
    // veamos la doc real. Posibles keys alternativas: cfdiTimbradoBase64, sello,
    // certificadoSAT, fechaTimbrado.
    const uuid           = String(r.uuid ?? '');
    const selloSat       = String(r.selloSAT ?? r.selloSat ?? '');
    const certificadoSat = String(r.certificadoSAT ?? r.certificadoSat ?? '');
    const fechaTimbrado  = String(r.fechaTimbrado ?? '');
    const cadenaOriginal = String(r.cadenaOriginal ?? '');
    const xmlB64Resp     = String(r.cfdiTimbrado ?? r.cfdiTimbradoBase64 ?? '');

    if (!uuid || !xmlB64Resp) {
      return { ok: false, code: 500, message: 'Respuesta CONTPAQi Timbra sin uuid/cfdiTimbrado', retryable: false };
    }

    const xmlTimbrado = Buffer.from(xmlB64Resp, 'base64');
    const fe = String(selloSat).slice(-8);
    const qrContent = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${cfdi.emisor.rfc}&rr=${cfdi.receptor.rfc}&tt=${cfdi.total.toFixed(2)}&fe=${fe}`;
    const qrPng = await generateQrPng(qrContent);

    return { ok: true, uuid, selloSat, certificadoSat, fechaTimbrado, cadenaOriginal, xmlTimbrado, qrPng };
  }

  async timbrarPago(_pago: PagoInput, _opts: TimbrarOpts): Promise<StampResult> {
    return { ok: false, code: 501, message: 'timbrarPago no soportado por CONTPAQi Timbra aún', retryable: false };
  }

  async cancelar(
    uuid: string, motivo: CancelMotivo, uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    _csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult> {
    const url = `${opts.testMode ? ENDPOINT.test : ENDPOINT.prod}/cancelar`;
    const { status, json } = await jsonCall(
      url, 'POST',
      baseHeaders(creds.usuario, creds.password),
      { uuid, motivo, ...(uuidSustituto ? { uuidSustituto } : {}) },
      opts.timeoutMs ?? 30000,
    );
    const r = (json ?? {}) as Record<string, unknown>;
    const respStatus = Number(r.status ?? status);
    if (respStatus !== 200) return { status: 'rejected', code: respStatus, message: String(r.mensaje ?? '') };
    return { status: 'sent_to_sat', message: String(r.mensaje ?? '') };
  }

  async consultarEstatusCancelacion(
    uuid: string, creds: { usuario: string; password: string }, opts: CancelOpts,
  ): Promise<CancelStatus> {
    const url = `${opts.testMode ? ENDPOINT.test : ENDPOINT.prod}/cancelacion/${encodeURIComponent(uuid)}`;
    const { json } = await jsonCall(
      url, 'GET',
      baseHeaders(creds.usuario, creds.password),
      undefined,
      opts.timeoutMs ?? 30000,
    );
    const r = (json ?? {}) as Record<string, unknown>;
    const mensaje = String(r.mensaje ?? '');
    const acuse = r.acuseXmlBase64 ? Buffer.from(String(r.acuseXmlBase64), 'base64') : undefined;
    if (/cancel/i.test(mensaje) && !/no cancel/i.test(mensaje)) return { status: 'accepted', acuseXml: acuse, message: mensaje };
    if (/proceso|pendiente/i.test(mensaje)) return { status: 'pending', message: mensaje };
    if (/no cancelable|rechaz/i.test(mensaje)) return { status: 'rejected', message: mensaje };
    if (/plazo|expir/i.test(mensaje)) return { status: 'expired', message: mensaje };
    return { status: 'pending', message: mensaje };
  }
}

export const contpaqiTimbraProvider = new ContpaqiTimbraProvider();
