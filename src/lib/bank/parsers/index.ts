// Autodetect de parser según fingerprint del header.
// El caller puede pasar un hint para forzar un parser específico.

import type { BankSlug, RawBankTxn } from '../types';
import { looksLikeBbva, parseBbvaCsv } from './bbva';
import { looksLikeBanorte, parseBanorteCsv } from './banorte';

export interface ParseStatementResult {
  bankSlug: BankSlug | 'unknown';
  txns: RawBankTxn[];
  statementPeriodStart: Date | null;
  statementPeriodEnd: Date | null;
}

/**
 * Parsea texto CSV de un extracto bancario. Si `hint` se provee, fuerza ese
 * parser; si no, usa fingerprint. En caso ambiguo (ambos matchean) → BBVA.
 */
export function parseBankStatement(
  text: string,
  hint?: BankSlug,
): ParseStatementResult {
  const empty: ParseStatementResult = {
    bankSlug: 'unknown',
    txns: [],
    statementPeriodStart: null,
    statementPeriodEnd: null,
  };

  if (!text || typeof text !== 'string') return empty;

  if (hint === 'bbva') {
    const txns = parseBbvaCsv(text);
    return { ...buildPeriod(txns), bankSlug: 'bbva', txns };
  }
  if (hint === 'banorte') {
    const txns = parseBanorteCsv(text);
    return { ...buildPeriod(txns), bankSlug: 'banorte', txns };
  }

  // Autodetect: BBVA gana en caso de empate (más común en MX).
  if (looksLikeBbva(text)) {
    const txns = parseBbvaCsv(text);
    if (txns.length > 0) return { ...buildPeriod(txns), bankSlug: 'bbva', txns };
  }
  if (looksLikeBanorte(text)) {
    const txns = parseBanorteCsv(text);
    if (txns.length > 0) return { ...buildPeriod(txns), bankSlug: 'banorte', txns };
  }

  return empty;
}

function buildPeriod(txns: RawBankTxn[]): { statementPeriodStart: Date | null; statementPeriodEnd: Date | null } {
  if (txns.length === 0) return { statementPeriodStart: null, statementPeriodEnd: null };
  let min = txns[0].date;
  let max = txns[0].date;
  for (const t of txns) {
    if (t.date < min) min = t.date;
    if (t.date > max) max = t.date;
  }
  return { statementPeriodStart: min, statementPeriodEnd: max };
}

export { parseBbvaCsv, looksLikeBbva } from './bbva';
export { parseBanorteCsv, looksLikeBanorte } from './banorte';
