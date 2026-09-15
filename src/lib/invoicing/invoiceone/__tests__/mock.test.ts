import { describe, it, expect } from 'vitest';
import { invoiceOneProvider } from '../index';
import type { CfdiInput } from '../../provider';

function sampleCfdi(overrides: Partial<CfdiInput> = {}): CfdiInput {
  return {
    emisor: {
      rfc:            'IPA200101ABC',
      regimenFiscal:  '601',
      nombre:         'IPARK ESTACIONAMIENTOS SA DE CV',
    },
    receptor: {
      rfc:              'XAXX010101000',
      nombre:           'PUBLICO EN GENERAL',
      usoCfdi:          'G03',
      regimenFiscal:    '616',
      domicilioFiscal:  '64000',
    },
    lugarExpedicion: '66600',
    formaPago:       '04',
    metodoPago:      'PUE',
    moneda:          'MXN',
    conceptos: [{
      claveProdServ: '78111808',
      claveUnidad:   'DAY',
      cantidad:      3,
      descripcion:   'Estancia estacionamiento aeropuerto MTY 3 días',
      valorUnitario: 250,
      importe:       750,
      iva:           120,
    }],
    subtotal: 750,
    iva:      120,
    total:    870,
    csd: { cerPem: '', keyPem: '', noCertificado: '30001000000500003416' },
    pacCredentials: { usuario: 'demo', password: 'demo' },
    ...overrides,
  };
}

describe('InvoiceOne provider (mock mode)', () => {
  it('timbra en modo demo con credenciales usuario=demo', async () => {
    const result = await invoiceOneProvider.timbrar(sampleCfdi(), { testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.uuid).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
    expect(result.selloSat.length).toBeGreaterThan(100);
    expect(result.xmlTimbrado.toString('utf8')).toContain('<cfdi:Comprobante');
    expect(result.xmlTimbrado.toString('utf8')).toContain('TimbreFiscalDigital');
    expect(result.qrPng.length).toBeGreaterThan(500);
    expect(result.providerRef).toMatch(/^MOCK-/);
  });

  it('mock respeta datos del emisor y receptor en el XML', async () => {
    const result = await invoiceOneProvider.timbrar(sampleCfdi(), { testMode: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const xml = result.xmlTimbrado.toString('utf8');
    expect(xml).toContain('IPA200101ABC');
    expect(xml).toContain('IPARK ESTACIONAMIENTOS');
    expect(xml).toContain('XAXX010101000');
  });

  it('mock genera cancelación aceptada en modo demo', async () => {
    const res = await invoiceOneProvider.cancelar(
      'AAAA1111-BBBB-2222-CCCC-333344445555',
      '02',
      null,
      { usuario: 'demo', password: 'demo' },
      { cerPem: '', keyPem: '', noCertificado: '' },
      { testMode: true },
    );
    expect(res.status).toBe('sent_to_sat');
  });

  it('timbrarPago mock devuelve 501 (REP no simulado en demo)', async () => {
    const pagoInput = {
      emisor: sampleCfdi().emisor,
      receptor: {
        rfc: 'XAXX010101000', nombre: 'PUBLICO', regimenFiscal: '616',
        domicilioFiscal: '64000', usoCfdi: 'CP01' as const,
      },
      lugarExpedicion: '66600',
      pago: {
        fechaPago: '2026-09-09T12:00:00',
        formaDePagoP: '03', monedaP: 'MXN' as const, monto: 1000,
        documentosRelacionados: [],
      },
      csd: { cerPem: '', keyPem: '', noCertificado: '' },
      pacCredentials: { usuario: 'demo', password: 'demo' },
    };
    const res = await invoiceOneProvider.timbrarPago(pagoInput, { testMode: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe(501);
  });
});
