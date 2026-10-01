// Tipos core del subsistema de conciliación bancaria para Nalú.
//
// Pipeline:
//   CSV/XLSX extracto bancario → parsers/* → RawBankTxn[]
//   RawBankTxn[] × InvoiceCandidate[] → reconciler → MatchResult[]
//   MatchResult[] → bank_reconciliations row + Excel 3 hojas
//
// Sin dependencia a Supabase ni al executor: lib pura, trivialmente testable.

/**
 * Transacción cruda de un estado de cuenta bancario, normalizada entre bancos.
 * Un parser toma su formato nativo (BBVA/Banorte/etc) y devuelve esto.
 */
export interface RawBankTxn {
  /** Fecha del movimiento (día local MX, hora 00:00). */
  date: Date;
  /** Monto absoluto en MXN. Siempre positivo. Signo va en `kind`. */
  amount: number;
  /** Depósito recibido (`credit`) o cargo/retiro (`debit`). */
  kind: 'credit' | 'debit';
  /** Descripción/concepto tal cual aparece en el extracto. */
  description: string;
  /**
   * Referencia numérica si el banco la expone (ej. folio SPEI, referencia
   * numérica). Útil para match contra folio CFDI o referencia personalizada.
   */
  reference: string | null;
  /** Fila original del CSV (1-indexed) para debugging. */
  sourceRow: number;
}

/**
 * CFDI emitido candidato a conciliar. Es el subset mínimo que necesita el
 * reconciler — el executor es quien hace el SELECT a `centinelia_billing`
 * y proyecta a esta shape.
 */
export interface InvoiceCandidate {
  /** UUID fiscal del CFDI. */
  uuid: string;
  /** Folio corto para humanos (opcional). */
  folio: string | null;
  /** Total facturado en MXN. */
  total: number;
  /** Fecha de emisión (día local MX). */
  issuedAt: Date;
  /** PUE o PPD. PPD requiere complemento de pago. */
  metodoPago: 'PUE' | 'PPD';
  /** RFC del receptor (cliente final que pagaría). */
  clienteRfc: string | null;
  /** Nombre del receptor para fuzzy-match contra descripción. */
  clienteNombre: string | null;
  /**
   * Monto ya pagado del CFDI (0 si pendiente). Para PPD acumula los parciales.
   * Reconciler solo mira CFDIs con `total - paidSoFar > 0`.
   */
  paidSoFar: number;
}

/**
 * Resultado de intentar matchear una transacción contra el pool de CFDIs.
 * Un `txn` puede terminar matched (1 CFDI claro), review (ambiguo o parcial)
 * o unmatched (ningún candidato razonable).
 */
export interface MatchResult {
  txnSourceRow: number;
  txn: RawBankTxn;
  /**
   * CFDI elegido o `null` si no hay match. En caso de review puede ser el
   * mejor candidato aunque el score sea medio.
   */
  invoice: InvoiceCandidate | null;
  /** 0-100. 100 = cert absoluta. */
  score: number;
  /** Clasificación del batch. */
  status: 'auto' | 'review' | 'unmatched';
  /**
   * Razón legible por humanos para review/unmatched. Vacío en auto.
   * Ejemplos: "monto difiere 3.5%", "fecha del CFDI está 7 días antes",
   * "2 candidatos con score 85", "ningún CFDI pendiente en ±45d".
   */
  reason: string;
  /**
   * Breakdown del scoring para auditoría y tuning.
   * amount y date son 0-100 cada uno; reference es 0-100 bonus.
   */
  breakdown: {
    amount: number;
    date: number;
    reference: number;
  };
}

/**
 * Un batch de conciliación completo. Se persiste en `bank_reconciliations`
 * en Supabase (F2+). Aquí es solo el DTO.
 */
export interface ReconciliationBatch {
  bankSlug: BankSlug;
  statementPeriodStart: Date;
  statementPeriodEnd: Date;
  matches: MatchResult[];
  /** Transacciones ignoradas (debit sin CFDI aplicable). */
  skipped: RawBankTxn[];
  totals: {
    txns: number;
    auto: number;
    review: number;
    unmatched: number;
    skipped: number;
  };
}

/** Bancos soportados en Fase 1. Más bancos se agregan por adición al union. */
export type BankSlug = 'bbva' | 'banorte';

/**
 * Umbrales de scoring. Ajustables sin tocar el motor — mantiene policy
 * en un solo lugar para el handoff Nazre→Tortillería.
 */
export const SCORE_THRESHOLDS = {
  AUTO_MIN: 90,
  REVIEW_MIN: 60,
} as const;

/**
 * Ventana temporal (en días) para considerar candidatos:
 * - antes: 45d (PPD típico paga 30-45d después de emitir)
 * - después: 15d (ocasionalmente banco procesa el día siguiente)
 */
export const CANDIDATE_WINDOW_DAYS = {
  BEFORE: 45,
  AFTER: 15,
} as const;
