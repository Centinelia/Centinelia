// Facturama PAC provider (REST/JSON, Basic Auth).
//
// Diferencia clave vs SF/CONTPAQi: Facturama guarda el CSD server-side (subido
// vía web UI o API `POST /csd`). Nuestro campo `csd` en CfdiInput/PagoInput se
// IGNORA porque Facturama firma con el CSD tied to the account. Si en el futuro
// Nala necesita cargar CSD nuevo, se hace vía Facturama web o llamada aparte.
//
// Auth: usuario API (nombre corto tipo "centinelia", NO email ni RFC) +
// contraseña API. Confirmado por Facturama soporte 2026-09-02.
//
// Env vars:
//   FACTURAMA_ENDPOINT_SANDBOX  (default: https://apisandbox.facturama.mx)
//   FACTURAMA_ENDPOINT_PROD     (default: https://api.facturama.mx)
//
// Credenciales: se pasan por request (creds en CfdiInput.pacCredentials).

import type {
  InvoicingProvider, CfdiInput, PagoInput, StampResult, TimbrarOpts,
  CancelMotivo, CancelSubmitResult, CancelStatus, CancelOpts,
} from '../provider';
import { buildIngresoPayload, buildPagoPayload } from './payload-builder';
import { extractErrorMessage, mapFacturamaError } from './error-mapping';
import { baseUrl, basicAuthHeader, facturamaJsonCall, facturamaFetchBuffer } from './api-client';

async function generateQrPng(content: string): Promise<Buffer> {
  const { toBuffer } = await import('qrcode');
  return toBuffer(content, { type: 'png', width: 300, margin: 1 });
}

interface FacturamaStampedResponse {
  Id: string;
  CfdiType: string;
  Serie?: string;
  Folio?: string;
  Date: string;
  /**
   * Facturama devuelve `Complement` (sin -o) en la respuesta, aunque el request
   * usa `Complemento` (con -o). Inconsistencia del API confirmada 2026-09-02.
   */
  Complement?: {
    TaxStamp?: {
      Uuid: string;
      Date: string;
      CfdiSign: string;
      SatCertNumber: string;
      SatSign: string;
      RfcProvCertif?: string;
    };
  };
  OriginalString?: string;
  Issuer?: { Rfc: string };
  Receiver?: { Rfc: string };
  Total?: number;
}

async function fetchXml(
  id: string, auth: string, testMode: boolean, timeoutMs: number,
): Promise<Buffer> {
  const url = `${baseUrl(testMode)}/cfdi/xml/issued/${id}`;
  const { status, buffer } = await facturamaFetchBuffer(url, auth, timeoutMs);
  if (status !== 200) throw new Error(`Facturama GET xml (${status})`);
  const asStr = buffer.toString('utf8').trimStart();
  return asStr.startsWith('<?xml') || asStr.startsWith('<cfdi:')
    ? buffer
    : Buffer.from(asStr, 'base64');
}

export class FacturamaProvider implements InvoicingProvider {
  async timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult> {
    const auth = basicAuthHeader(cfdi.pacCredentials.usuario, cfdi.pacCredentials.password);
    const payload = buildIngresoPayload(cfdi);
    const url = `${baseUrl(opts.testMode)}/3/cfdis`;
    const { status, json, raw } = await facturamaJsonCall(url, 'POST', auth, payload, opts.timeoutMs ?? 30000);

    if (status !== 200 && status !== 201) {
      const info = mapFacturamaError(status);
      return { ok: false, code: status, message: extractErrorMessage(json, raw), retryable: info.retryable };
    }

    return this.processStampResponse(json as FacturamaStampedResponse, auth, opts, {
      re: cfdi.emisor.rfc, rr: cfdi.receptor.rfc, tt: cfdi.total,
    });
  }

  async timbrarPago(pago: PagoInput, opts: TimbrarOpts): Promise<StampResult> {
    const auth = basicAuthHeader(pago.pacCredentials.usuario, pago.pacCredentials.password);
    const payload = buildPagoPayload(pago);
    const url = `${baseUrl(opts.testMode)}/3/cfdis`;
    const { status, json, raw } = await facturamaJsonCall(url, 'POST', auth, payload, opts.timeoutMs ?? 30000);

    if (status !== 200 && status !== 201) {
      const info = mapFacturamaError(status);
      return { ok: false, code: status, message: extractErrorMessage(json, raw), retryable: info.retryable };
    }

    return this.processStampResponse(json as FacturamaStampedResponse, auth, opts, {
      re: pago.emisor.rfc, rr: pago.receptor.rfc, tt: 0,
    });
  }

  private async processStampResponse(
    resp: FacturamaStampedResponse,
    auth: string,
    opts: TimbrarOpts,
    qrData: { re: string; rr: string; tt: number },
  ): Promise<StampResult> {
    const taxStamp = resp.Complement?.TaxStamp;
    if (!resp.Id || !taxStamp?.Uuid) {
      return { ok: false, code: 500, message: 'Respuesta Facturama sin Id/Uuid', retryable: false };
    }

    let xmlTimbrado: Buffer;
    try {
      xmlTimbrado = await fetchXml(resp.Id, auth, opts.testMode, opts.timeoutMs ?? 30000);
    } catch (e) {
      return { ok: false, code: 500, message: `Facturama XML fetch: ${(e as Error).message}`, retryable: true };
    }

    const fe = taxStamp.SatSign.slice(-8);
    const qrContent = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${taxStamp.Uuid}&re=${qrData.re}&rr=${qrData.rr}&tt=${qrData.tt.toFixed(2)}&fe=${fe}`;
    const qrPng = await generateQrPng(qrContent);

    return {
      ok: true,
      uuid: taxStamp.Uuid,
      selloSat: taxStamp.SatSign,
      certificadoSat: taxStamp.SatCertNumber,
      fechaTimbrado: taxStamp.Date,
      cadenaOriginal: resp.OriginalString ?? '',
      xmlTimbrado,
      qrPng,
      providerRef: resp.Id,
    };
  }

  async cancelar(
    uuid: string, motivo: CancelMotivo, uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    _csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult> {
    const auth = basicAuthHeader(creds.usuario, creds.password);
    const facturamaId = uuid;
    const params = new URLSearchParams({
      type: 'issued',
      motive: motivo,
      ...(uuidSustituto ? { uuidReplacement: uuidSustituto } : {}),
    });
    const url = `${baseUrl(opts.testMode)}/cfdi/${encodeURIComponent(facturamaId)}?${params.toString()}`;
    const { status, json, raw } = await facturamaJsonCall(url, 'DELETE', auth, undefined, opts.timeoutMs ?? 30000);
    if (status !== 200 && status !== 202) {
      return { status: 'rejected', code: status, message: extractErrorMessage(json, raw) };
    }
    return { status: 'sent_to_sat', message: `Facturama accepted cancelacion (status ${status})` };
  }

  async consultarEstatusCancelacion(
    uuid: string, creds: { usuario: string; password: string }, opts: CancelOpts,
  ): Promise<CancelStatus> {
    const auth = basicAuthHeader(creds.usuario, creds.password);
    const url = `${baseUrl(opts.testMode)}/cfdi/status/${encodeURIComponent(uuid)}`;
    const { status, json, raw } = await facturamaJsonCall(url, 'GET', auth, undefined, opts.timeoutMs ?? 30000);
    if (status !== 200) return { status: 'pending', message: extractErrorMessage(json, raw) };
    const r = (json ?? {}) as Record<string, unknown>;
    const s = String(r.Status ?? r.status ?? '').toLowerCase();
    if (s.includes('cancel') && !s.includes('no cancel')) return { status: 'accepted', message: String(r.Status) };
    if (s.includes('proceso') || s.includes('pending')) return { status: 'pending', message: String(r.Status) };
    if (s.includes('no cancelable') || s.includes('rechaz')) return { status: 'rejected', message: String(r.Status) };
    return { status: 'pending', message: String(r.Status ?? '') };
  }
}

export const facturamaProvider = new FacturamaProvider();
