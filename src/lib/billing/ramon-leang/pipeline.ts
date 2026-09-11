/**
 * Pipeline Ramón Leang: convierte bloques semanales del Excel en BillingInvoice[]
 * listos para timbrar.
 *
 * Regla de negocio: 1 CFDI por cada día hábil + 1 CFDI adicional (ajuste centavos).
 * Todos van a Público General (XAXX010101000). Monto uniforme salvo el ajuste.
 *
 * Nala NO calcula — RESPETA los montos ya calculados por la usuaria (Beatriz PV).
 * Si ella redondeó 14507.75 → 14507, respetamos su criterio.
 */

import type { BillingInvoice, PaymentMethod } from '../adapter';
import type { ParsedWeekBlock } from '../parsers/ramon-leang-weekly';
import type { RamonLeangConfig, PipelineErrorRL, PipelineWarningRL } from './types';

/**
 * Set de códigos SAT c_FormaPago válidos según catálogo oficial (subset usado
 * en México). Cualquier código fuera de este set indica config corrupta.
 */
const SAT_FORMA_PAGO_VALIDOS = new Set([
  '01', '02', '03', '04', '05', '06', '08', '12', '13', '14', '15', '17',
  '23', '24', '25', '26', '27', '28', '29', '30', '31', '99',
]);

/** True si el string es un código SAT c_FormaPago válido. */
export function isValidFormaPagoSat(code: unknown): code is string {
  return typeof code === 'string' && SAT_FORMA_PAGO_VALIDOS.has(code);
}

/**
 * Mapea código SAT c_FormaPago al string interno del BillingAdapter. Solo
 * mapeamos los 4 métodos que nuestro adapter conoce. El resto (monedero
 * electrónico, vales, dación en pago, etc.) cae a 'efectivo' por defecto,
 * con warning si el código no es siquiera un SAT válido.
 */
function formaPagoSatToMethod(code: string): PaymentMethod {
  if (!isValidFormaPagoSat(code)) {
    console.warn('[ramon-leang/pipeline] formaPago no es código SAT válido, cayendo a efectivo:', code);
    return 'efectivo';
  }
  switch (code) {
    case '01': return 'efectivo';
    case '02': return 'cheque';
    case '03': return 'transferencia';
    case '04': return 'tarjeta';
    default:   return 'efectivo';
  }
}

export interface PipelineResultRL {
  invoices:    BillingInvoice[];
  /** Metadata paralela a `invoices` (mismo índice). */
  invoiceMeta: InvoiceMetaRL[];
  errors:      PipelineErrorRL[];
  warnings:    PipelineWarningRL[];
}

export interface InvoiceMetaRL {
  sourceBlock: ParsedWeekBlock;
  isAjuste:    boolean;
}

// ---- Helpers --------------------------------------------------------------

/**
 * Construye la fecha ISO YYYY-MM-DD a partir de weekStart + día del mes.
 * Ej. weekStart="2026-09-04" + dia=1 → "2026-09-01".
 *
 * Correcto en semanas que cruzan mes: si weekStart="2026-09-29" y el día
 * hábil es 3, retorna "2026-10-03" (no "2026-09-03"). Busca el offset 0-6
 * cuyo día-del-mes calendárico calza con dayOfMonth.
 */
export function dayOfMonthToIsoDate(weekStart: string, dayOfMonth: number): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + offset);
    if (d.getUTCDate() === dayOfMonth) {
      return d.toISOString().slice(0, 10);
    }
  }
  // Fallback (día fuera de la semana): interpreta same-month best-effort.
  // No debería pasar si diasHabiles viene bien validado, pero preservamos
  // comportamiento antiguo para no perder facturas silenciosamente.
  const [y, m] = weekStart.split('-').map(Number);
  const dd = String(dayOfMonth).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

// ---- Entry point ----------------------------------------------------------

/**
 * Convierte 1 bloque semanal en su lista de CFDIs listos para timbrar.
 * Cada CFDI tiene 1 sola línea (SKU único, cantidad=1, precio=monto del CFDI).
 */
export function buildInvoicesFromWeek(
  block: ParsedWeekBlock,
  config: RamonLeangConfig,
): { invoices: BillingInvoice[]; meta: InvoiceMetaRL[]; error: string | null } {
  // Validaciones básicas: sin estos datos no podemos construir invoices.
  if (block.cfdiBase == null || block.cfdiBase <= 0) {
    return { invoices: [], meta: [], error: `Semana ${block.weekStart}: falta cfdiBase (monto de las N primeras facturas).` };
  }
  if (block.diasHabiles.length === 0) {
    return { invoices: [], meta: [], error: `Semana ${block.weekStart}: no hay días hábiles definidos.` };
  }

  const invoices: BillingInvoice[] = [];
  const meta:     InvoiceMetaRL[]  = [];

  // Observaciones: lo que Beatriz escribió en la columna "Observaciones" del
  // Excel se copia verbatim al CFDI. Si viene vacío, usamos el default.
  const notas = block.observaciones?.trim() || 'Ramón Leang - Venta al público general';

  // 1 CFDI por cada día hábil, monto = cfdiBase.
  for (const diaOfMonth of block.diasHabiles) {
    const fecha = dayOfMonthToIsoDate(block.weekStart, diaOfMonth);
    invoices.push(buildOneInvoice(fecha, block.cfdiBase, config, notas));
    meta.push({ sourceBlock: block, isAjuste: false });
  }

  // 1 CFDI adicional (ajuste centavos) SOLO si viene declarado en el Excel.
  // Si Beatriz no lo puso, asumimos que la división dio exacta y no hay ajuste.
  if (block.ajusteFecha && block.ajusteMonto != null && block.ajusteMonto > 0) {
    invoices.push(buildOneInvoice(block.ajusteFecha, block.ajusteMonto, config, notas));
    meta.push({ sourceBlock: block, isAjuste: true });
  }

  return { invoices, meta, error: null };
}

/**
 * Construye 1 BillingInvoice a Público General (XAXX010101000) con 1 línea.
 * cantidad=1, precio=monto para que el CFDI muestre el importe como PrecioUnitario.
 * IVA tasa del config (tortillas = 0).
 */
function buildOneInvoice(
  fecha: string,
  monto: number,
  config: RamonLeangConfig,
  notes: string,
): BillingInvoice {
  return {
    clientRFC:     'XAXX010101000',
    date:          fecha,
    lines: [{
      sku:         config.sku,
      qty:         1,
      unitPrice:   Math.round(monto * 100) / 100,
      ivaTasa:     config.ivaTasa,
      description: config.descripcion,
    }],
    paymentMethod: formaPagoSatToMethod(config.formaPago),
    usoCFDI:       config.usoCFDI,
    serie:         config.serie,
    metodoPago:    'PUE',
    notes,
  };
}

/**
 * Construye TODAS las invoices de un array de bloques semanales.
 * Acumula errors y warnings.
 */
export function buildInvoicesFromBlocks(
  blocks: ParsedWeekBlock[],
  config: RamonLeangConfig,
): PipelineResultRL {
  const invoices:    BillingInvoice[] = [];
  const invoiceMeta: InvoiceMetaRL[]  = [];
  const errors:      PipelineErrorRL[] = [];
  const warnings:    PipelineWarningRL[] = [];

  for (const b of blocks) {
    for (const w of b.warnings) warnings.push({ weekStart: b.weekStart, message: w });
    const result = buildInvoicesFromWeek(b, config);
    if (result.error) {
      errors.push({ weekStart: b.weekStart, reason: result.error });
      continue;
    }
    invoices.push(...result.invoices);
    invoiceMeta.push(...result.meta);
  }

  return { invoices, invoiceMeta, errors, warnings };
}
