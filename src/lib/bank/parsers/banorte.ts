// Parser para extractos Banorte México (Banca En Línea empresarial).
//
// Formato observado: Fecha | Concepto | Depósitos | Retiros | Saldo | Referencia.
// Diferencia principal vs BBVA: usa Depósitos/Retiros (plural o singular)
// en lugar de Abono/Cargo. Mismo flujo de detección y normalización.

import type { RawBankTxn } from '../types';
import {
  splitCsvLine, detectDelimiter, splitLines, parseAmountMx, parseDateDmy, findColumn,
} from './_csv';

const BANORTE_HEADER_KEYWORDS = ['fecha', 'concepto', 'deposit', 'retir'];

export function looksLikeBanorte(text: string): boolean {
  if (!text) return false;
  const lines = splitLines(text).slice(0, 20);
  for (const line of lines) {
    const normalized = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const hits = BANORTE_HEADER_KEYWORDS.filter((k) => normalized.includes(k)).length;
    if (hits >= 3) return true;
  }
  return false;
}

function isHeaderLine(line: string): boolean {
  const normalized = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hits = BANORTE_HEADER_KEYWORDS.filter((k) => normalized.includes(k)).length;
  return hits >= 3;
}

export function parseBanorteCsv(text: string): RawBankTxn[] {
  if (!text || !looksLikeBanorte(text)) return [];

  const lines = splitLines(text);
  const headerIdx = lines.findIndex(isHeaderLine);
  if (headerIdx < 0) return [];

  const headerLine = lines[headerIdx];
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCsvLine(headerLine, delimiter).map((h) => h.trim());

  const colFecha = findColumn(headers, ['fecha']);
  const colConcepto = findColumn(headers, ['concepto', 'descripcion']);
  const colDeposito = findColumn(headers, ['deposito', 'depositos', 'abono']);
  const colRetiro = findColumn(headers, ['retiro', 'retiros', 'cargo']);
  const colRef = findColumn(headers, ['referencia', 'ref']);

  if (colFecha < 0 || colConcepto < 0 || (colDeposito < 0 && colRetiro < 0)) return [];

  const out: RawBankTxn[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], delimiter);
    const date = parseDateDmy(fields[colFecha]);
    if (!date) continue;

    const deposito = colDeposito >= 0 ? parseAmountMx(fields[colDeposito]) : 0;
    const retiro = colRetiro >= 0 ? parseAmountMx(fields[colRetiro]) : 0;

    let kind: 'credit' | 'debit';
    let amount: number;
    if (deposito > 0 && retiro === 0) {
      kind = 'credit';
      amount = deposito;
    } else if (retiro > 0 && deposito === 0) {
      kind = 'debit';
      amount = retiro;
    } else {
      continue;
    }

    const refRaw = colRef >= 0 ? (fields[colRef] ?? '').trim() : '';
    const reference = refRaw === '' ? null : refRaw;

    out.push({
      date,
      amount,
      kind,
      description: (fields[colConcepto] ?? '').trim(),
      reference,
      sourceRow: i + 1,
    });
  }
  return out;
}
