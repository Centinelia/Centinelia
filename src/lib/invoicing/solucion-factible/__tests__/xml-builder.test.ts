import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { buildCfdiXml } from '../xml-builder';

const input = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures', 'cfdi-v4-sample-input.json'), 'utf8')
);

describe('buildCfdiXml (CFDI 4.0)', () => {
  const xml = buildCfdiXml(input, 'FOLIO-001');
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const cfdi = parsed['cfdi:Comprobante'];

  it('root tag Comprobante con Version=4.0', () => {
    expect(cfdi['@Version']).toBe('4.0');
  });
  it('atributos monetarios formateados con 2 decimales string', () => {
    expect(cfdi['@SubTotal']).toBe('100.00');
    expect(cfdi['@Total']).toBe('116.00');
  });
  it('incluye Sello y NoCertificado vacíos listos para firma', () => {
    expect(cfdi['@Sello']).toBe('');
    expect(cfdi['@NoCertificado']).toBe('');
    expect(cfdi['@Certificado']).toBe('');
  });
  it('emisor y receptor con RFC correctos', () => {
    expect(cfdi['cfdi:Emisor']['@Rfc']).toBe('EKU9003173C9');
    expect(cfdi['cfdi:Receptor']['@Rfc']).toBe('XAXX010101000');
    expect(cfdi['cfdi:Receptor']['@RegimenFiscalReceptor']).toBe('616');
    expect(cfdi['cfdi:Receptor']['@DomicilioFiscalReceptor']).toBe('64000');
  });
  it('concepto con IVA 16% en Impuestos.Traslados', () => {
    const c = cfdi['cfdi:Conceptos']['cfdi:Concepto'];
    expect(c['@ClaveProdServ']).toBe('01010101');
    expect(c['@Importe']).toBe('100.00');
    const traslado = c['cfdi:Impuestos']['cfdi:Traslados']['cfdi:Traslado'];
    expect(traslado['@Impuesto']).toBe('002');
    expect(traslado['@TasaOCuota']).toBe('0.160000');
    expect(traslado['@Importe']).toBe('16.00');
  });
  it('namespaces xsi + cfdi declarados en root', () => {
    expect(cfdi['@xmlns:cfdi']).toBe('http://www.sat.gob.mx/cfd/4');
    expect(cfdi['@xmlns:xsi']).toBe('http://www.w3.org/2001/XMLSchema-instance');
    expect(cfdi['@xsi:schemaLocation']).toContain('http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd');
  });
});
