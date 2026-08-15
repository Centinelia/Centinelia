export type CancelMotivo = '01' | '02' | '03' | '04';

export interface TimbrarOpts { testMode: boolean; timeoutMs?: number; }
export interface CancelOpts { testMode: boolean; timeoutMs?: number; }

export interface CfdiInput {
  emisor: { rfc: string; regimenFiscal: string; nombre: string };
  receptor: {
    rfc: string; nombre: string;
    usoCfdi: string; regimenFiscal: string; domicilioFiscal: string;
  };
  lugarExpedicion: string;
  formaPago: string; metodoPago: string;
  moneda: 'MXN' | 'USD'; tipoCambio?: number;
  conceptos: Array<{
    claveProdServ: string; claveUnidad: string;
    cantidad: number; descripcion: string;
    valorUnitario: number; importe: number;
    iva?: number;
  }>;
  subtotal: number; iva: number; total: number;
  csd: { cerPem: string; keyPem: string; noCertificado: string };
  pacCredentials: { usuario: string; password: string };
}

export type StampResult =
  | {
      ok: true;
      uuid: string; selloSat: string; certificadoSat: string;
      fechaTimbrado: string; cadenaOriginal: string;
      xmlTimbrado: Buffer; qrPng: Buffer;
    }
  | { ok: false; code: number; message: string; retryable: boolean };

export interface CancelSubmitResult {
  status: 'sent_to_sat' | 'rejected';
  code?: number;
  message: string;
}

export interface CancelStatus {
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  acuseXml?: Buffer;
  message?: string;
}

export interface InvoicingProvider {
  timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult>;
  cancelar(
    uuid: string,
    motivo: CancelMotivo,
    uuidSustituto: string | null,
    creds: { usuario: string; password: string },
    csd: { cerPem: string; keyPem: string; noCertificado: string },
    opts: CancelOpts,
  ): Promise<CancelSubmitResult>;
  consultarEstatusCancelacion(
    uuid: string,
    creds: { usuario: string; password: string },
    opts: CancelOpts,
  ): Promise<CancelStatus>;
}
