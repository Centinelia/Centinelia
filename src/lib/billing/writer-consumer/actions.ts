/**
 * writer-consumer/actions.ts — Decide qué acción tomar por cada factura
 * fallida en el reporte del writer, según su <see cref="ErrorKind" />.
 *
 * Diseño: funciones puras que reciben dependencias (callbacks para reply,
 * escalate, re-deposit) en vez de importarlas directamente. Facilita tests
 * y desacopla del cron endpoint.
 *
 * Mapping por kind (ver README del writer):
 *   rfcNotFound   → reply al cliente pidiendo dar de alta el RFC
 *   skuNotFound   → reply al cliente aclarando qué producto no reconocemos
 *   pacError      → re-depositar en pendientes/ (content-hash idempotente)
 *   invalidData   → escalar a Nazre (bug del generador de Nala)
 *   catalogAccess → alertar operador Centinelia (SQL/CONTPAQi caído)
 *   other         → escalar con detalle técnico para revisión manual
 */

import type { InvoiceResult, FatalReport, ErrorKind } from './report';

/** Acción resuelta para una factura fallida — decisión declarativa. */
export type ResolvedAction =
  | { type: 'reply_to_client';    humanMessage: string; kind: ErrorKind }
  | { type: 'redeposit_pending';  reason: string }
  | { type: 'escalate_to_nazre';  humanMessage: string; kind: ErrorKind }
  | { type: 'noop' };

/**
 * Decide la acción para una <see cref="InvoiceResult" /> fallida.
 * Devuelve `noop` si la factura fue OK (nada que hacer aquí, ese caso lo
 * maneja el consumer de `timbrados/`).
 */
export function resolveInvoiceAction(result: InvoiceResult): ResolvedAction {
  if (result.ok) return { type: 'noop' };
  const msg = result.humanMessage ?? result.error ?? `Error sin detalle (${result.kind})`;

  switch (result.kind) {
    case 'rfcNotFound':
    case 'skuNotFound':
      return { type: 'reply_to_client', humanMessage: msg, kind: result.kind };

    case 'pacError':
      return { type: 'redeposit_pending', reason: msg };

    case 'invalidData':
    case 'catalogAccess':
    case 'other':
    default:
      return { type: 'escalate_to_nazre', humanMessage: msg, kind: result.kind };
  }
}

/**
 * Decide la acción para un reporte fatal (el archivo entero falló en parse
 * antes de tocar facturas). Siempre escala — no hay `results[]` que reintentar.
 */
export function resolveFatalAction(report: FatalReport): ResolvedAction {
  return {
    type: 'escalate_to_nazre',
    humanMessage: report.fatalMessage,
    kind: report.fatalKind,
  };
}
