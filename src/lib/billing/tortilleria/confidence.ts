/**
 * confidence.ts — evalúa si una card puede auto-aprobarse sin revisión humana.
 *
 * Filosofía: **auto por default, humano solo excepciones**. Si una card cumple
 * TODOS los criterios objetivos, se marca `status='approved'` y el pipeline
 * la manda al adapter directo. Cualquier duda → `status='pending'` con reason
 * detallado y Beatriz recibe un correo.
 *
 * Los checks son puramente estructurales — no involucran ML, humano-en-el-loop,
 * ni umbrales borrosos. Falla explícita > tolerancia silenciosa.
 */

import type { BillingInvoice } from '../adapter';
import type { ParsedBlock } from '../parsers/tortilleria-batch';
import type { TortilleriaMapping } from './types';

export interface ConfidenceCheckInput {
  invoice:      BillingInvoice;
  sourceBlocks: ParsedBlock[];
  mapping:      TortilleriaMapping;
  /** Warnings del parser/pipeline para este bloque (si los hubo). */
  warnings:     string[];
}

export interface ConfidenceResult {
  /** true si TODOS los checks pasan. */
  autoApprove: boolean;
  /**
   * Motivos por los que NO se puede auto-aprobar. Vacío si autoApprove=true.
   * El primero es el que se muestra como "reason" principal en la card.
   */
  reasons: string[];
}

/**
 * Evalúa 5 criterios:
 *
 *  1. RFC del cliente vino del mapping (no fallback al código).
 *  2. Total calculado del bloque cuadra con el total declarado en el Excel
 *     (diff < $1). Si el Excel no trajo total declarado, es sospechoso.
 *  3. Todas las líneas tienen precio > 0.
 *  4. Todos los SKUs vienen del mapping (no del columnaNombre fallback).
 *  5. Sin warnings del parser/pipeline para este bloque.
 *
 * El check #4 es indirecto: chequea si el SKU está en el catálogo mapping.products.
 * Los SKUs fallback son el columnaNombre uppercased (ej. "ESTRELLA 1KG") — si
 * no matchea ningún entry.sku del mapping, es fallback.
 */
export function checkConfidence(input: ConfidenceCheckInput): ConfidenceResult {
  const reasons: string[] = [];

  // 1) RFC del mapping (no código como fallback)
  const rfcLooksLikeCode = !isValidRfcShape(input.invoice.clientRFC);
  if (rfcLooksLikeCode) {
    reasons.push(`Este cliente no tiene RFC en tu catálogo (tiene el código "${input.invoice.clientRFC}"). Agrega el RFC para que Nala pueda facturarlo automáticamente.`);
  }

  // 2) Total del Excel cuadra
  //    Cuando hay consolidación (DCA), sumamos los totales declarados de todos
  //    los bloques fuente vs. el total calculado del invoice.
  const totalCalculado = input.invoice.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const totalesExcel = input.sourceBlocks
    .map(b => b.totalGeneralExcel)
    .filter((t): t is number => t != null);
  if (totalesExcel.length !== input.sourceBlocks.length) {
    reasons.push('Este bloque no trae TOTAL GENERAL en tu Excel, no pude confirmar que el total esté bien. Agrégalo o revisa el bloque a mano.');
  } else {
    const totalDeclarado = totalesExcel.reduce((s, t) => s + t, 0);
    if (Math.abs(totalCalculado - totalDeclarado) > 1) {
      reasons.push(`El total no cuadra: Nala calculó $${totalCalculado.toFixed(2)} sumando cantidades por precio, pero tu Excel dice $${totalDeclarado.toFixed(2)} (diferencia $${Math.abs(totalCalculado - totalDeclarado).toFixed(2)}). Revisa cantidades o precios.`);
    }
  }

  // 3) Todas las líneas con precio > 0
  const zeroPrice = input.invoice.lines.filter(l => !(l.unitPrice > 0));
  if (zeroPrice.length > 0) {
    const names = zeroPrice.slice(0, 3).map(l => l.description ?? l.sku).join(', ');
    reasons.push(`${zeroPrice.length} producto(s) sin precio: ${names}${zeroPrice.length > 3 ? '…' : ''}. Agrega el precio en tu Excel.`);
  }

  // 4) Todos los SKUs del mapping (no fallback)
  const mappingSkus = new Set(input.mapping.products.map(p => p.sku));
  const unmappedSkus = input.invoice.lines.filter(l => !mappingSkus.has(l.sku));
  if (unmappedSkus.length > 0) {
    const names = unmappedSkus.slice(0, 3).map(l => l.description ?? l.sku).join(', ');
    reasons.push(`${unmappedSkus.length} producto(s) no están en tu catálogo de códigos: ${names}${unmappedSkus.length > 3 ? '…' : ''}. Dime a qué SKU corresponden.`);
  }

  // 5) Sin warnings del parser. Los warnings ya vienen humanizados desde el
  //    parser/pipeline; los mostramos completos y con formato de bullets si
  //    hay más de uno.
  if (input.warnings.length > 0) {
    if (input.warnings.length === 1) {
      reasons.push(`Nala reportó: ${input.warnings[0]}`);
    } else {
      const bullets = input.warnings.map(w => `• ${w}`).join('\n');
      reasons.push(`Nala reportó ${input.warnings.length} cosas para revisar:\n${bullets}`);
    }
  }

  return { autoApprove: reasons.length === 0, reasons };
}

/**
 * Un RFC mexicano válido tiene 12-13 chars, letras + números + homoclave.
 * Regex laxa: al menos 3 letras + 6 dígitos + 3 chars alfanuméricos.
 * Sirve para distinguir un RFC real de un código de cliente CONTPAQi
 * (que puede ser "045", "SILLATPROP", "DCA", etc.).
 */
function isValidRfcShape(s: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(s.trim());
}
