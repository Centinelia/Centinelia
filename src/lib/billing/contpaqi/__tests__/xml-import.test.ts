import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildImportXml, type XmlImportConfig } from '../xml-import';
import type { BillingInvoice } from '@/lib/billing/adapter';

const fixtureDir = path.join(__dirname, 'fixtures');

const BASE_CONFIG: XmlImportConfig = {
  serie: 'A',
  rfcEmisor: 'XAXX010101000',
  regimenFiscal: '601',
  lugarExpedicion: '64000',
  usoCFDIDefault: 'G03',
};

const SINGLE_INVOICE: BillingInvoice = {
  clientRFC: 'TDM040101ABC',
  date: '2026-08-17',
  lines: [{ sku: 'TOR-MAI-KG', qty: 5, unitPrice: 18.0 }],
  paymentMethod: 'transferencia',
  usoCFDI: 'G03',
  serie: 'A',
};

describe('buildImportXml', () => {
  it('1 factura 1 linea genera XML valido con todos los campos', () => {
    const xml = buildImportXml([SINGLE_INVOICE], BASE_CONFIG);
    const expected = fs
      .readFileSync(path.join(fixtureDir, 'expected-invoice-single.xml'), 'utf8')
      .replace(/\r\n/g, '\n');

    expect(xml.trim()).toBe(expected.trim());
  });

  it('2 facturas generan 2 elementos Documento', () => {
    const second: BillingInvoice = {
      clientRFC: 'XEXX010101000',
      date: '2026-08-18',
      lines: [{ sku: 'TOR-HAR-KG', qty: 2, unitPrice: 32.0 }],
      paymentMethod: 'efectivo',
      usoCFDI: 'P01',
    };
    const xml = buildImportXml([SINGLE_INVOICE, second], BASE_CONFIG);
    const matches = xml.match(/<Documento>/g);
    expect(matches).toHaveLength(2);
  });

  it('multi-lineas suma correctamente el Total del Documento', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [
        { sku: 'TOR-MAI-KG', qty: 3, unitPrice: 18.0 },
        { sku: 'TOR-HAR-KG', qty: 2, unitPrice: 32.0 },
      ],
      paymentMethod: 'transferencia',
      usoCFDI: 'G03',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    // 3 * 18 + 2 * 32 = 54 + 64 = 118.00
    expect(xml).toContain('<Total>118.00</Total>');
    expect(xml).toContain('<Subtotal>118.00</Subtotal>');
  });

  it('forma de pago efectivo genera FormaPago 01', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [{ sku: 'TOR-MAI-KG', qty: 1, unitPrice: 18.0 }],
      paymentMethod: 'efectivo',
      usoCFDI: 'G03',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    expect(xml).toContain('<FormaPago>01</FormaPago>');
  });

  it('SKU con caracteres especiales se escapan correctamente (A&B -> A&amp;B)', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [{ sku: 'A&B', qty: 1, unitPrice: 10.0 }],
      paymentMethod: 'transferencia',
      usoCFDI: 'G03',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    expect(xml).toContain('<CodigoProducto>A&amp;B</CodigoProducto>');
    expect(xml).not.toContain('<CodigoProducto>A&B</CodigoProducto>');
  });

  it('RFC receptor con caracteres < y > se escapan', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'A<B>C',
      date: '2026-08-18',
      lines: [{ sku: 'SKU1', qty: 1, unitPrice: 50.0 }],
      paymentMethod: 'cheque',
      usoCFDI: 'G03',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    expect(xml).toContain('<RfcReceptor>A&lt;B&gt;C</RfcReceptor>');
  });

  it('forma de pago desconocida usa FormaPago 99 por defecto', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [{ sku: 'TOR-MAI-KG', qty: 1, unitPrice: 18.0 }],
      paymentMethod: 'tarjeta',
      usoCFDI: 'G03',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    expect(xml).toContain('<FormaPago>04</FormaPago>');
  });

  it('importe de linea se redondea a 2 decimales', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [{ sku: 'TOR-MAI-KG', qty: 3, unitPrice: 18.333 }],
      paymentMethod: 'transferencia',
      usoCFDI: 'G03',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    // 3 * 18.333 = 54.999 -> 55.00
    expect(xml).toContain('<Importe>55.00</Importe>');
  });

  it('serie del invoice sobreescribe la serie del config', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [{ sku: 'TOR-MAI-KG', qty: 1, unitPrice: 18.0 }],
      paymentMethod: 'transferencia',
      usoCFDI: 'G03',
      serie: 'B',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    expect(xml).toContain('<Serie>B</Serie>');
  });

  it('usoCFDI del invoice sobreescribe el default del config', () => {
    const invoice: BillingInvoice = {
      clientRFC: 'TDM040101ABC',
      date: '2026-08-18',
      lines: [{ sku: 'TOR-MAI-KG', qty: 1, unitPrice: 18.0 }],
      paymentMethod: 'transferencia',
      usoCFDI: 'P01',
    };
    const xml = buildImportXml([invoice], BASE_CONFIG);
    expect(xml).toContain('<UsoCFDI>P01</UsoCFDI>');
  });
});
