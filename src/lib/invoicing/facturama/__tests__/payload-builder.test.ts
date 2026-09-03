import { describe, it, expect } from 'vitest';
import { buildIngresoPayload, buildPagoPayload } from '../payload-builder';
import type { CfdiInput, PagoInput } from '../../provider';

const dummyCsd = { cerPem: '', keyPem: '', noCertificado: '00001000000710339677' };
const dummyCreds = { usuario: 'u', password: 'p' };

describe('buildIngresoPayload', () => {
  it('mapea CFDI Ingreso completo con IVA a shape Facturama', () => {
    const cfdi: CfdiInput = {
      emisor: { rfc: 'AAMN951208I25', regimenFiscal: '612', nombre: 'NAZRE HASSAM MIGUEL ASSAD MORALES' },
      receptor: {
        rfc: 'TEN010518AL3', nombre: 'TORTILLAS ESTRELLA DEL NORTE',
        usoCfdi: 'G03', regimenFiscal: '601', domicilioFiscal: '66470',
      },
      lugarExpedicion: '64989',
      formaPago: '99', metodoPago: 'PPD',
      moneda: 'MXN',
      conceptos: [
        {
          claveProdServ: '81112501', claveUnidad: 'E48',
          cantidad: 1, descripcion: 'Contratación Empleado Centinelia (Noah)',
          valorUnitario: 14990, importe: 14990, iva: 2398.4,
        },
        {
          claveProdServ: '81112501', claveUnidad: 'E48',
          cantidad: 1, descripcion: 'Jornada Alta Demanda',
          valorUnitario: 11988, importe: 11988, iva: 1918.08,
        },
      ],
      subtotal: 26978, iva: 4316.48, total: 31294.48,
      csd: dummyCsd, pacCredentials: dummyCreds,
    };

    const payload = buildIngresoPayload(cfdi);

    expect(payload.CfdiType).toBe('I');
    expect(payload.NameId).toBe('1');
    expect(payload.Issuer.Rfc).toBe('AAMN951208I25');
    expect(payload.Receiver.CfdiUse).toBe('G03');
    expect(payload.Receiver.TaxZipCode).toBe('66470');
    expect(payload.Items).toHaveLength(2);
    expect(payload.Items?.[0].TaxObject).toBe('02');
    expect(payload.Items?.[0].Taxes?.[0].Total).toBe(2398.4);
    expect(payload.Items?.[0].Taxes?.[0].Rate).toBe(0.16);
  });

  it('marca TaxObject 01 cuando concepto no tiene IVA', () => {
    const cfdi: CfdiInput = {
      emisor: { rfc: 'X', regimenFiscal: '612', nombre: 'X' },
      receptor: { rfc: 'X', nombre: 'X', usoCfdi: 'G03', regimenFiscal: '601', domicilioFiscal: '00000' },
      lugarExpedicion: '00000',
      formaPago: '03', metodoPago: 'PUE',
      moneda: 'MXN',
      conceptos: [{
        claveProdServ: '01010101', claveUnidad: 'E48',
        cantidad: 1, descripcion: 'Sin IVA', valorUnitario: 100, importe: 100,
      }],
      subtotal: 100, iva: 0, total: 100,
      csd: dummyCsd, pacCredentials: dummyCreds,
    };
    const payload = buildIngresoPayload(cfdi);
    expect(payload.Items?.[0].TaxObject).toBe('01');
    expect(payload.Items?.[0].Taxes).toBeUndefined();
  });
});

describe('buildPagoPayload', () => {
  it('mapea REP para el pago SPEI de Tortillería Estrella (caso real)', () => {
    const pago: PagoInput = {
      emisor: { rfc: 'AAMN951208I25', regimenFiscal: '612', nombre: 'NAZRE HASSAM MIGUEL ASSAD MORALES' },
      receptor: {
        rfc: 'TEN010518AL3', nombre: 'TORTILLAS ESTRELLA DEL NORTE',
        regimenFiscal: '601', domicilioFiscal: '66470', usoCfdi: 'CP01',
      },
      lugarExpedicion: '64989',
      pago: {
        fechaPago: '2026-08-27T15:31:00',
        formaDePagoP: '03',
        monedaP: 'MXN',
        monto: 31294.48,
        numOperacion: '1254526',
        documentosRelacionados: [{
          uuid: '5F1C5803-747F-4C1A-A03B-6BC3EF901FB2',
          monedaDR: 'MXN',
          metodoDePagoDR: 'PPD',
          numParcialidad: 1,
          impSaldoAnt: 31294.48,
          impPagado: 31294.48,
          impSaldoInsoluto: 0,
          objetoImpDR: '02',
          taxes: [{
            base: 26978,
            impuesto: '002',
            tipoFactor: 'Tasa',
            tasaOCuota: 0.16,
            importe: 4316.48,
            isRetencion: false,
          }],
        }],
      },
      csd: dummyCsd, pacCredentials: dummyCreds,
    };

    const payload = buildPagoPayload(pago);

    expect(payload.CfdiType).toBe('P');
    expect(payload.NameId).toBe('14');
    expect(payload.Receiver.CfdiUse).toBe('CP01');
    expect(payload.Items).toBeUndefined();

    const p = payload.Complemento?.Payments[0];
    expect(p?.Amount).toBe(31294.48);
    expect(p?.PaymentForm).toBe('03');
    expect(p?.OperationNumber).toBe('1254526');
    expect(p?.RelatedDocuments).toHaveLength(1);

    const dr = p?.RelatedDocuments[0];
    expect(dr?.Uuid).toBe('5F1C5803-747F-4C1A-A03B-6BC3EF901FB2');
    expect(dr?.PartialityNumber).toBe(1);
    expect(dr?.PreviousBalanceAmount).toBe(31294.48);
    expect(dr?.AmountPaid).toBe(31294.48);
    expect(dr?.ImpSaldoInsoluto).toBe(0);
    expect(dr?.TaxObject).toBe('02');
    expect(dr?.Taxes?.[0].Total).toBe(4316.48);
    expect(dr?.Taxes?.[0].Name).toBe('IVA');
  });

  it('omite Taxes cuando documento no tiene impuestos', () => {
    const pago: PagoInput = {
      emisor: { rfc: 'X', regimenFiscal: '612', nombre: 'X' },
      receptor: { rfc: 'X', nombre: 'X', regimenFiscal: '601', domicilioFiscal: '00000', usoCfdi: 'CP01' },
      lugarExpedicion: '00000',
      pago: {
        fechaPago: '2026-08-27T15:31:00',
        formaDePagoP: '03', monedaP: 'MXN', monto: 100,
        documentosRelacionados: [{
          uuid: 'aaaa', monedaDR: 'MXN', metodoDePagoDR: 'PPD',
          numParcialidad: 1, impSaldoAnt: 100, impPagado: 100, impSaldoInsoluto: 0,
        }],
      },
      csd: dummyCsd, pacCredentials: dummyCreds,
    };
    const payload = buildPagoPayload(pago);
    expect(payload.Complemento?.Payments[0].RelatedDocuments[0].Taxes).toBeUndefined();
  });
});
