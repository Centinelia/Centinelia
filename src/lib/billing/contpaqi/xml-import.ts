/**
 * xml-import.ts — Generador de XML ADD para importacion a CONTPAQi Comercial.
 *
 * Produce el formato de Documentos que acepta la utilidad de importacion de
 * CONTPAQi. Sin dependencias externas; todo el XML se construye manualmente
 * para mantener cero overhead de bundle y control total sobre el escape.
 *
 * Uso:
 *   const xml = buildImportXml(invoices, config);
 *   // guardar como archivo .xml para carga manual en CONTPAQi
 */

import type { BillingInvoice, BillingLineItem } from '@/lib/billing/adapter';
import {
  XML_NAMESPACE,
  CONCEPTO_FACTURA,
  METODO_PAGO_PUE,
  FORMA_PAGO_MAP,
  FORMA_PAGO_DEFAULT,
} from './xml-import-templates';

/**
 * Parametros de configuracion del emisor para el XML de importacion.
 * Estos valores son propios del negocio y no cambian por factura.
 */
export interface XmlImportConfig {
  /** Serie del comprobante (ej: 'A'). Puede ser sobreescrita por BillingInvoice.serie. */
  serie: string;
  /** RFC del emisor (empresa que factura). */
  rfcEmisor: string;
  /** Clave de regimen fiscal del emisor (SAT). Ej: '601', '612'. */
  regimenFiscal: string;
  /** Codigo postal del lugar de expedicion (domicilio fiscal del emisor). */
  lugarExpedicion: string;
  /** Clave de uso CFDI por defecto. Puede ser sobreescrita por BillingInvoice.usoCFDI. */
  usoCFDIDefault: string;
}

/**
 * Escapa los caracteres especiales XML: &, <, >, ".
 * Necesario para cualquier valor textual que se inserte en el XML.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calcula el importe de una linea: qty * unitPrice, redondeado a 2 decimales.
 */
function calcImporte(line: BillingLineItem): number {
  return Math.round(line.qty * line.unitPrice * 100) / 100;
}

/**
 * Formatea un numero monetario como string con exactamente 2 decimales.
 */
function fmt(value: number): string {
  return value.toFixed(2);
}

/**
 * Formatea ivaTasa como string con 1 decimal minimo.
 * Ejemplos: 0 -> '0.0', 0.16 -> '0.16', 0.08 -> '0.08'.
 */
function fmtIvaTasa(tasa: number): string {
  // Use at least 1 decimal place, trimming trailing zeros beyond that.
  const s = tasa.toFixed(2).replace(/\.?0+$/, '');
  return s.includes('.') ? s : s + '.0';
}

/**
 * Calcula el importe de IVA para una linea: importe * ivaTasa, redondeado a 2 decimales.
 */
function calcIvaImporte(line: BillingLineItem): number {
  const tasa = line.ivaTasa ?? 0;
  if (tasa <= 0) return 0;
  return Math.round(calcImporte(line) * tasa * 100) / 100;
}

/**
 * Genera el bloque XML de un solo <Movimiento>.
 * Si line.ivaTasa esta presente y es mayor a 0, se usa esa tasa.
 * Si no, la tasa es 0.0 (exento/tasa cero), manteniendo backwards compat.
 */
function buildMovimiento(line: BillingLineItem): string {
  const importe = calcImporte(line);
  const ivaTasaNum = line.ivaTasa ?? 0;
  const ivaTasaStr = fmtIvaTasa(ivaTasaNum);

  return [
    '      <Movimiento>',
    `        <CodigoProducto>${escapeXml(line.sku)}</CodigoProducto>`,
    `        <Cantidad>${line.qty}</Cantidad>`,
    `        <PrecioUnitario>${fmt(line.unitPrice)}</PrecioUnitario>`,
    `        <Importe>${fmt(importe)}</Importe>`,
    `        <IvaTasa>${ivaTasaStr}</IvaTasa>`,
    '      </Movimiento>',
  ].join('\n');
}

/**
 * Genera el bloque XML de un solo <Documento> a partir de una BillingInvoice.
 */
function buildDocumento(invoice: BillingInvoice, config: XmlImportConfig): string {
  const serie = escapeXml(invoice.serie ?? config.serie);
  const usoCFDI = escapeXml(invoice.usoCFDI || config.usoCFDIDefault);
  const formaPago = FORMA_PAGO_MAP[invoice.paymentMethod] ?? FORMA_PAGO_DEFAULT;

  // Calcular subtotal (suma de importes sin IVA) y total (subtotal + IVA acumulado).
  // Cada linea puede tener su propia tasa, incluyendo tasa 0 (exento).
  const subtotal = invoice.lines.reduce((acc, line) => acc + calcImporte(line), 0);
  const totalIva = invoice.lines.reduce((acc, line) => acc + calcIvaImporte(line), 0);
  const total = subtotal + totalIva;
  const subtotalStr = fmt(Math.round(subtotal * 100) / 100);
  const totalStr = fmt(Math.round(total * 100) / 100);

  const movimientos = invoice.lines.map(buildMovimiento).join('\n');

  return [
    '  <Documento>',
    '    <Encabezado>',
    `      <Concepto>${escapeXml(CONCEPTO_FACTURA)}</Concepto>`,
    `      <Serie>${serie}</Serie>`,
    `      <Fecha>${escapeXml(invoice.date)}</Fecha>`,
    `      <RfcEmisor>${escapeXml(config.rfcEmisor)}</RfcEmisor>`,
    `      <RfcReceptor>${escapeXml(invoice.clientRFC)}</RfcReceptor>`,
    `      <UsoCFDI>${usoCFDI}</UsoCFDI>`,
    `      <MetodoPago>${escapeXml(METODO_PAGO_PUE)}</MetodoPago>`,
    `      <FormaPago>${escapeXml(formaPago)}</FormaPago>`,
    '      <Moneda>MXN</Moneda>',
    `      <LugarExpedicion>${escapeXml(config.lugarExpedicion)}</LugarExpedicion>`,
    `      <Subtotal>${subtotalStr}</Subtotal>`,
    `      <Total>${totalStr}</Total>`,
    '    </Encabezado>',
    '    <Movimientos>',
    movimientos,
    '    </Movimientos>',
    '  </Documento>',
  ].join('\n');
}

/**
 * Genera el XML ADD completo para un lote de facturas, listo para importar
 * en CONTPAQi Comercial.
 *
 * @param invoices Lista de facturas a incluir. Al menos una es requerida.
 * @param config   Parametros del emisor (RFC, serie, regimen, CP, usoCFDI default).
 * @returns        String UTF-8 con el XML completo, incluyendo la declaracion XML.
 */
export function buildImportXml(invoices: BillingInvoice[], config: XmlImportConfig): string {
  const documentos = invoices.map((inv) => buildDocumento(inv, config)).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Documentos xmlns="${XML_NAMESPACE}">`,
    documentos,
    '</Documentos>',
    '',
  ].join('\n');
}
