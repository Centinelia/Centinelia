// Traduce nuestros types CfdiInput / PagoInput al payload JSON que espera
// Facturama en POST /3/cfdis.
//
// Doc: https://apisandbox.facturama.mx/docs
// El shape es case-sensitive (PascalCase). Facturama valida contra schema JSON.

import type { CfdiInput, PagoInput } from '../provider';

export interface FacturamaCfdiPayload {
  NameId?: string;
  CfdiType: 'I' | 'P';
  ExpeditionPlace: string;
  Serie?: string;
  Folio?: string;
  PaymentForm?: string;
  PaymentMethod?: string;
  Currency?: string;
  ExchangeRate?: number;
  Issuer: {
    FiscalRegime: string;
    Rfc: string;
    Name: string;
  };
  Receiver: {
    Rfc: string;
    Name: string;
    CfdiUse: string;
    FiscalRegime: string;
    TaxZipCode: string;
  };
  Items?: Array<{
    ProductCode: string;
    UnitCode: string;
    Description: string;
    Quantity: number;
    UnitPrice: number;
    Subtotal: number;
    Total: number;
    TaxObject?: string;
    Taxes?: Array<{
      Total: number;
      Name: string;
      Base: number;
      Rate: number;
      IsRetention: boolean;
    }>;
  }>;
  Complemento?: {
    Payments: Array<{
      Date: string;
      PaymentForm: string;
      Amount: number;
      Currency: string;
      ExchangeRate?: number;
      OperationNumber?: string;
      IssuerRfcAccount?: string;
      IssuerBankName?: string;
      IssuerAccount?: string;
      BeneficiaryRfcAccount?: string;
      BeneficiaryAccount?: string;
      RelatedDocuments: Array<{
        Uuid: string;
        Serie?: string;
        Folio?: string;
        Currency: string;
        ExchangeRate?: number;
        PaymentMethod: string;
        PartialityNumber: number;
        PreviousBalanceAmount: number;
        AmountPaid: number;
        ImpSaldoInsoluto: number;
        TaxObject: string;
        Taxes?: Array<{
          Total: number;
          Name: string;
          Base: number;
          Rate: number;
          IsRetention: boolean;
        }>;
      }>;
    }>;
  };
}

export function buildIngresoPayload(cfdi: CfdiInput, opts: { serie?: string; folio?: string } = {}): FacturamaCfdiPayload {
  const items = cfdi.conceptos.map(c => {
    const subtotal = +(c.cantidad * c.valorUnitario).toFixed(2);
    const iva = c.iva ?? 0;
    const total = +(subtotal + iva).toFixed(2);
    return {
      ProductCode: c.claveProdServ,
      UnitCode: c.claveUnidad,
      Description: c.descripcion,
      Quantity: c.cantidad,
      UnitPrice: c.valorUnitario,
      Subtotal: subtotal,
      Total: total,
      TaxObject: iva > 0 ? '02' : '01',
      ...(iva > 0
        ? {
            Taxes: [{
              Total: iva,
              Name: 'IVA',
              Base: subtotal,
              Rate: 0.16,
              IsRetention: false,
            }],
          }
        : {}),
    };
  });

  return {
    NameId: '1',
    CfdiType: 'I',
    ExpeditionPlace: cfdi.lugarExpedicion,
    ...(opts.serie ? { Serie: opts.serie } : {}),
    ...(opts.folio ? { Folio: opts.folio } : {}),
    PaymentForm: cfdi.formaPago,
    PaymentMethod: cfdi.metodoPago,
    Currency: cfdi.moneda,
    ...(cfdi.tipoCambio ? { ExchangeRate: cfdi.tipoCambio } : {}),
    Issuer: {
      FiscalRegime: cfdi.emisor.regimenFiscal,
      Rfc: cfdi.emisor.rfc,
      Name: cfdi.emisor.nombre,
    },
    Receiver: {
      Rfc: cfdi.receptor.rfc,
      Name: cfdi.receptor.nombre,
      CfdiUse: cfdi.receptor.usoCfdi,
      FiscalRegime: cfdi.receptor.regimenFiscal,
      TaxZipCode: cfdi.receptor.domicilioFiscal,
    },
    Items: items,
  };
}

export function buildPagoPayload(pago: PagoInput, opts: { serie?: string; folio?: string } = {}): FacturamaCfdiPayload {
  const relatedDocuments = pago.pago.documentosRelacionados.map(dr => ({
    Uuid: dr.uuid,
    ...(dr.serie ? { Serie: dr.serie } : {}),
    ...(dr.folio ? { Folio: dr.folio } : {}),
    Currency: dr.monedaDR,
    ...(dr.tipoCambioDR ? { ExchangeRate: dr.tipoCambioDR } : {}),
    PaymentMethod: dr.metodoDePagoDR,
    PartialityNumber: dr.numParcialidad,
    PreviousBalanceAmount: dr.impSaldoAnt,
    AmountPaid: dr.impPagado,
    ImpSaldoInsoluto: dr.impSaldoInsoluto,
    TaxObject: dr.objetoImpDR ?? '02',
    ...(dr.taxes && dr.taxes.length > 0
      ? {
          Taxes: dr.taxes.map(t => ({
            Total: t.importe,
            Name: t.impuesto === '002' ? 'IVA' : t.impuesto === '003' ? 'IEPS' : 'ISR',
            Base: t.base,
            Rate: t.tasaOCuota ?? 0,
            IsRetention: t.isRetencion ?? false,
          })),
        }
      : {}),
  }));

  return {
    NameId: '14',
    CfdiType: 'P',
    ExpeditionPlace: pago.lugarExpedicion,
    ...(opts.serie ? { Serie: opts.serie } : {}),
    ...(opts.folio ? { Folio: opts.folio } : {}),
    Issuer: {
      FiscalRegime: pago.emisor.regimenFiscal,
      Rfc: pago.emisor.rfc,
      Name: pago.emisor.nombre,
    },
    Receiver: {
      Rfc: pago.receptor.rfc,
      Name: pago.receptor.nombre,
      CfdiUse: pago.receptor.usoCfdi,
      FiscalRegime: pago.receptor.regimenFiscal,
      TaxZipCode: pago.receptor.domicilioFiscal,
    },
    Complemento: {
      Payments: [{
        Date: pago.pago.fechaPago,
        PaymentForm: pago.pago.formaDePagoP,
        Amount: pago.pago.monto,
        Currency: pago.pago.monedaP,
        ...(pago.pago.tipoCambioP ? { ExchangeRate: pago.pago.tipoCambioP } : {}),
        ...(pago.pago.numOperacion ? { OperationNumber: pago.pago.numOperacion } : {}),
        ...(pago.pago.rfcEmisorCtaOrd ? { IssuerRfcAccount: pago.pago.rfcEmisorCtaOrd } : {}),
        ...(pago.pago.nomBancoOrdExt ? { IssuerBankName: pago.pago.nomBancoOrdExt } : {}),
        ...(pago.pago.ctaOrdenante ? { IssuerAccount: pago.pago.ctaOrdenante } : {}),
        ...(pago.pago.rfcEmisorCtaBen ? { BeneficiaryRfcAccount: pago.pago.rfcEmisorCtaBen } : {}),
        ...(pago.pago.ctaBeneficiario ? { BeneficiaryAccount: pago.pago.ctaBeneficiario } : {}),
        RelatedDocuments: relatedDocuments,
      }],
    },
  };
}
