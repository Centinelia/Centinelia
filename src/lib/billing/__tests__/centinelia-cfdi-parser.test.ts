/**
 * Tests del parser XML de CFDI 4.0. Corre sin DB — logica pura.
 *
 * Fixture: XML real de la factura Centinelia a Tortilleria Estrella del Norte
 * emitida el 2026-09-21, UUID A1FC4F3A-F870-4F14-B6C6-958687605B4D.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCfdiXml } from '../centinelia-cfdi-parser';

const tortilleriaXml = readFileSync(
  join(__dirname, 'fixtures', 'tortilleria-2026-09-21.xml'),
  'utf-8',
);

describe('parseCfdiXml — XML real de Tortilleria', () => {
  it('extrae el UUID fiscal en mayusculas', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.uuid).toBe('A1FC4F3A-F870-4F14-B6C6-958687605B4D');
  });

  it('extrae fecha de emision y fecha de timbrado', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.fechaEmision).toBe('2026-09-21T12:40:56');
    expect(parsed.data.fechaTimbrado).toBe('2026-09-21T12:44:32');
  });

  it('extrae tipo de comprobante I (Ingreso)', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.tipoComprobante).toBe('I');
  });

  it('extrae metodo de pago PPD y forma 99', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.metodoPago).toBe('PPD');
    expect(parsed.data.formaPago).toBe('99');
  });

  it('extrae emisor RFC AAMN951208I25 y regimen 612', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.emisor.rfc).toBe('AAMN951208I25');
    expect(parsed.data.emisor.nombre).toBe('NAZRE HASSAM MIGUEL ASSAD MORALES');
    expect(parsed.data.emisor.regimenFiscal).toBe('612');
  });

  it('extrae receptor RFC TEN010518AL3, uso G03, regimen 601, CP 66470', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.receptor.rfc).toBe('TEN010518AL3');
    expect(parsed.data.receptor.nombre).toBe('TORTILLAS ESTRELLA DEL NORTE');
    expect(parsed.data.receptor.usoCfdi).toBe('G03');
    expect(parsed.data.receptor.regimenFiscal).toBe('601');
    expect(parsed.data.receptor.domicilioFiscal).toBe('66470');
  });

  it('extrae subtotal 11988, iva 1918.08, total 13906.08', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.subtotal).toBe(11988);
    expect(parsed.data.iva).toBe(1918.08);
    expect(parsed.data.total).toBe(13906.08);
  });

  it('extrae moneda MXN y lugar de expedicion 64989', () => {
    const parsed = parseCfdiXml(tortilleriaXml);
    if (!parsed.ok) throw new Error('parse falló');
    expect(parsed.data.moneda).toBe('MXN');
    expect(parsed.data.lugarExpedicion).toBe('64989');
  });
});

describe('parseCfdiXml — error paths', () => {
  it('regresa error si el XML esta vacio', () => {
    const parsed = parseCfdiXml('');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/vacio|comprobante/i);
  });

  it('regresa error si no hay tag Comprobante', () => {
    const parsed = parseCfdiXml('<?xml version="1.0"?><foo />');
    expect(parsed.ok).toBe(false);
  });

  it('regresa error si el UUID no aparece (sin TimbreFiscalDigital)', () => {
    const noStamp = tortilleriaXml.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, '');
    const parsed = parseCfdiXml(noStamp);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/UUID|timbrado/i);
  });
});
