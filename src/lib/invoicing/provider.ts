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
      /**
       * Identificador interno del provider (Facturama Id, SF ticket, etc.)
       * Opcional. Se usa para operaciones follow-up que el provider necesita
       * (ej. Facturama GET /cfdi/pdf/issued/{Id} requiere el Id, no el UUID).
       */
      providerRef?: string;
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

export interface DocumentoRelacionadoPago {
  uuid: string;
  serie?: string;
  folio?: string;
  monedaDR: 'MXN' | 'USD';
  tipoCambioDR?: number;
  metodoDePagoDR: 'PPD';
  numParcialidad: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  objetoImpDR?: '01' | '02';
  taxes?: Array<{
    base: number;
    impuesto: '001' | '002' | '003';
    tipoFactor: 'Tasa' | 'Cuota' | 'Exento';
    tasaOCuota?: number;
    importe: number;
    isRetencion?: boolean;
  }>;
}

export interface PagoInput {
  emisor: { rfc: string; regimenFiscal: string; nombre: string };
  receptor: {
    rfc: string; nombre: string;
    regimenFiscal: string; domicilioFiscal: string;
    usoCfdi: 'CP01';
  };
  lugarExpedicion: string;
  pago: {
    fechaPago: string;
    formaDePagoP: string;
    monedaP: 'MXN' | 'USD';
    tipoCambioP?: number;
    monto: number;
    numOperacion?: string;
    rfcEmisorCtaOrd?: string;
    nomBancoOrdExt?: string;
    ctaOrdenante?: string;
    rfcEmisorCtaBen?: string;
    ctaBeneficiario?: string;
    documentosRelacionados: DocumentoRelacionadoPago[];
  };
  csd: { cerPem: string; keyPem: string; noCertificado: string };
  pacCredentials: { usuario: string; password: string };
}

export interface InvoicingProvider {
  timbrar(cfdi: CfdiInput, opts: TimbrarOpts): Promise<StampResult>;
  /**
   * Timbra un Complemento de Pago (REP - CFDI tipo P).
   * No todos los PACs lo soportan. Los que no, deben devolver
   * { ok: false, code: 501, message: '...', retryable: false }
   */
  timbrarPago(pago: PagoInput, opts: TimbrarOpts): Promise<StampResult>;
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
