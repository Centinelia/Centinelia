// Motor de conciliación: dado un conjunto de transacciones bancarias y una
// lista de CFDIs emitidos pendientes, decide cuál pago corresponde a cuál
// factura con un score 0-100 y una clasificación auto/review/unmatched.
//
// Diseño:
// - 100% función pura, sin I/O. El caller (tool executor en F2) hace los
//   SELECTs a `centinelia_billing` y proyecta a InvoiceCandidate.
// - Scoring por 3 dimensiones: monto (50%), fecha (30%), referencia (20%).
// - Umbrales en types.ts (SCORE_THRESHOLDS) para que Nazre pueda ajustar
//   sin tocar la lógica del motor.

import type { InvoiceCandidate, MatchResult, RawBankTxn } from './types';
import { CANDIDATE_WINDOW_DAYS, SCORE_THRESHOLDS } from './types';

const DAY_MS = 86400000;
const WEIGHTS = { amount: 0.5, date: 0.3, reference: 0.2 } as const;

/**
 * Califica un pareo (txn, invoice) devolviendo score 0-100 y breakdown.
 * Función pura sin side effects. No decide status — solo mide.
 */
export function scoreMatch(txn: RawBankTxn, invoice: InvoiceCandidate): {
  score: number;
  breakdown: { amount: number; date: number; reference: number };
} {
  const amountScore = scoreAmount(txn.amount, invoice.total - invoice.paidSoFar);
  const dateScore = scoreDate(txn.date, invoice.issuedAt);
  const referenceScore = scoreReference(txn, invoice);

  let weighted =
    amountScore * WEIGHTS.amount +
    dateScore * WEIGHTS.date +
    referenceScore * WEIGHTS.reference;

  // Monto exacto al centavo es señal muy fuerte: típico pago PPD 30d
  // después del CFDI matchea en monto pero el date-decay lo baja de 90.
  // Floor del score a 90 cuando amount=100 preserva autoridad de la
  // dimensión más confiable sin perder discriminación entre candidatos
  // (el 90 es el piso, sigue habiendo 91-100 si date+ref ayudan).
  if (amountScore === 100 && weighted < 90) weighted = 90;

  return {
    score: Math.round(weighted),
    breakdown: {
      amount: Math.round(amountScore),
      date: Math.round(dateScore),
      reference: Math.round(referenceScore),
    },
  };
}

function scoreAmount(txnAmount: number, remainingOwed: number): number {
  if (remainingOwed <= 0) return 0;
  const diff = Math.abs(txnAmount - remainingOwed) / remainingOwed;
  if (diff === 0) return 100;
  if (diff <= 0.01) return 90;
  if (diff <= 0.05) return 70;
  if (diff <= 0.10) return 50;
  if (diff <= 0.20) return 25;
  return 0;
}

function scoreDate(txnDate: Date, invoiceDate: Date): number {
  const days = Math.abs((txnDate.getTime() - invoiceDate.getTime()) / DAY_MS);
  if (days === 0) return 100;
  if (days <= 3) return 85;
  if (days <= 7) return 70;
  if (days <= 15) return 55;
  if (days <= 30) return 40;
  if (days <= CANDIDATE_WINDOW_DAYS.BEFORE) return 25;
  return 0;
}

function scoreReference(txn: RawBankTxn, invoice: InvoiceCandidate): number {
  const description = normalize(txn.description);
  const txnRef = txn.reference ? normalize(txn.reference) : '';
  const folio = invoice.folio ? normalize(invoice.folio) : '';
  const nombre = invoice.clienteNombre ? normalize(invoice.clienteNombre) : '';

  // Match exacto por referencia o folio
  if (folio && txnRef && (txnRef === folio || txnRef.includes(folio) || folio.includes(txnRef))) {
    return 100;
  }
  if (folio && description.includes(folio)) {
    return 100;
  }

  // Fuzzy match por nombre del cliente en descripción
  if (nombre) {
    const words = nombre.split(/\s+/).filter((w) => w.length >= 4);
    const hits = words.filter((w) => description.includes(w)).length;
    if (hits === 0) return 0;
    const ratio = hits / Math.max(1, words.length);
    if (ratio >= 0.6) return 70;
    if (ratio >= 0.3) return 50;
    if (hits >= 1) return 40;
  }

  return 0;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Procesa un batch completo de transacciones contra candidatos CFDI.
 * Devuelve solo las txns de tipo credit (los débitos se filtran como gastos).
 */
export function reconcile(
  txns: RawBankTxn[],
  candidates: InvoiceCandidate[],
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const t of txns) {
    if (t.kind !== 'credit') continue;

    // Filtra candidatos con saldo pendiente y dentro de ventana temporal
    const eligible = candidates.filter((c) => {
      const remaining = c.total - c.paidSoFar;
      if (remaining <= 0) return false;
      const daysDiff = (t.date.getTime() - c.issuedAt.getTime()) / DAY_MS;
      // txn posterior al CFDI: hasta BEFORE días; txn anterior: hasta AFTER días
      return daysDiff >= -CANDIDATE_WINDOW_DAYS.AFTER && daysDiff <= CANDIDATE_WINDOW_DAYS.BEFORE;
    });

    if (eligible.length === 0) {
      results.push(buildUnmatched(t, 'ningún CFDI pendiente dentro de la ventana temporal'));
      continue;
    }

    // Calcula score para cada candidato
    const scored = eligible
      .map((c) => ({ invoice: c, ...scoreMatch(t, c) }))
      .sort((a, b) => b.score - a.score);

    const top = scored[0];
    const second = scored[1];

    // Clasificación
    if (top.score >= SCORE_THRESHOLDS.AUTO_MIN) {
      // Si hay un segundo igualmente bueno Y no hay señal clara de desempate
      // por referencia (match explícito folio/ref), degradar a review.
      const refDistinguishes = top.breakdown.reference - second?.breakdown.reference >= 30;
      if (
        second &&
        second.score >= SCORE_THRESHOLDS.AUTO_MIN &&
        Math.abs(top.score - second.score) < 10 &&
        !refDistinguishes
      ) {
        results.push({
          txnSourceRow: t.sourceRow,
          txn: t,
          invoice: top.invoice,
          score: top.score,
          status: 'review',
          reason: `ambigüedad: 2 CFDIs con score ${top.score}/${second.score}`,
          breakdown: top.breakdown,
        });
        continue;
      }
      results.push({
        txnSourceRow: t.sourceRow,
        txn: t,
        invoice: top.invoice,
        score: top.score,
        status: 'auto',
        reason: '',
        breakdown: top.breakdown,
      });
      continue;
    }

    if (top.score >= SCORE_THRESHOLDS.REVIEW_MIN) {
      results.push({
        txnSourceRow: t.sourceRow,
        txn: t,
        invoice: top.invoice,
        score: top.score,
        status: 'review',
        reason: buildReviewReason(t, top.invoice, top.breakdown),
        breakdown: top.breakdown,
      });
      continue;
    }

    results.push(buildUnmatched(t, `mejor candidato con score ${top.score} (bajo el umbral ${SCORE_THRESHOLDS.REVIEW_MIN})`));
  }

  return results;
}

function buildUnmatched(txn: RawBankTxn, reason: string): MatchResult {
  return {
    txnSourceRow: txn.sourceRow,
    txn,
    invoice: null,
    score: 0,
    status: 'unmatched',
    reason,
    breakdown: { amount: 0, date: 0, reference: 0 },
  };
}

function buildReviewReason(
  txn: RawBankTxn,
  invoice: InvoiceCandidate,
  breakdown: { amount: number; date: number; reference: number },
): string {
  const parts: string[] = [];
  const remaining = invoice.total - invoice.paidSoFar;
  if (breakdown.amount < 80) {
    const diffPct = Math.abs((txn.amount - remaining) / remaining * 100).toFixed(1);
    parts.push(`monto difiere ${diffPct}%`);
  }
  if (breakdown.date < 70) {
    const days = Math.round(Math.abs((txn.date.getTime() - invoice.issuedAt.getTime()) / DAY_MS));
    parts.push(`fecha fuera por ${days}d`);
  }
  if (breakdown.reference === 0) {
    parts.push('sin referencia reconocible');
  }
  return parts.length ? parts.join('; ') : 'score bajo';
}
