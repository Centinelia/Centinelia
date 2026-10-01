// Parser para extractos BBVA México (Net Cash / Banca En Línea).
//
// Formato validado contra export documentado DD/MM/YYYY con columnas
// FECHA | DESCRIPCIÓN | CARGO | ABONO | SALDO | REFERENCIA.
// Si Tortillería u otro cliente real entrega un layout distinto, agregar
// un fixture en __tests__/bbva.test.ts antes de ajustar la lógica.
//
// Resiliencia aplicada:
// - Soporta separadores `,` y `;` (BBVA cambia según idioma del Excel del cliente).
// - Soporta líneas de preámbulo antes del header (razón social, periodo).
// - Headers con/sin acentos.

import type { RawBankTxn } from '../types';
import {
  splitCsvLine, detectDelimiter, splitLines, parseAmountMx, parseDateDmy, findColumn,
} from './_csv';

/** Palabras clave que marcan el header BBVA. Case/accent insensitive. */
const BBVA_HEADER_KEYWORDS = ['fecha', 'descripcion', 'cargo', 'abono'];

/**
 * Fingerprint rápido: ¿el CSV huele a BBVA? Usado por el autodetect
 * para elegir parser cuando el cliente no especifica banco.
 */
export function looksLikeBbva(text: string): boolean {
  if (!text) return false;
  const lines = splitLines(text).slice(0, 20); // header suele estar en primeras 20
  for (const line of lines) {
    const normalized = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const hits = BBVA_HEADER_KEYWORDS.filter((k) => normalized.includes(k)).length;
    if (hits >= 3) return true;
  }
  return false;
}

function isHeaderLine(line: string): boolean {
  const normalized = line.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hits = BBVA_HEADER_KEYWORDS.filter((k) => normalized.includes(k)).length;
  return hits >= 3;
}

export function parseBbvaCsv(text: string): RawBankTxn[] {
  if (!text || !looksLikeBbva(text)) return [];

  const lines = splitLines(text);
  const headerIdx = lines.findIndex(isHeaderLine);
  if (headerIdx < 0) return [];

  const headerLine = lines[headerIdx];
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCsvLine(headerLine, delimiter).map((h) => h.trim());

  const colFecha = findColumn(headers, ['fecha']);
  const colDesc = findColumn(headers, ['descripcion', 'concepto']);
  const colCargo = findColumn(headers, ['cargo', 'retiro']);
  const colAbono = findColumn(headers, ['abono', 'deposito']);
  const colRef = findColumn(headers, ['referencia', 'ref']);

  if (colFecha < 0 || colDesc < 0 || (colCargo < 0 && colAbono < 0)) return [];

  const out: RawBankTxn[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], delimiter);
    const date = parseDateDmy(fields[colFecha]);
    if (!date) continue;

    const cargo = colCargo >= 0 ? parseAmountMx(fields[colCargo]) : 0;
    const abono = colAbono >= 0 ? parseAmountMx(fields[colAbono]) : 0;

    // Decide kind: abono > 0 → credit; cargo > 0 → debit; ambos 0 → skip
    let kind: 'credit' | 'debit';
    let amount: number;
    if (abono > 0 && cargo === 0) {
      kind = 'credit';
      amount = abono;
    } else if (cargo > 0 && abono === 0) {
      kind = 'debit';
      amount = cargo;
    } else {
      continue; // movimiento sin monto válido
    }

    const refRaw = colRef >= 0 ? (fields[colRef] ?? '').trim() : '';
    const reference = refRaw === '' ? null : refRaw;

    out.push({
      date,
      amount,
      kind,
      description: (fields[colDesc] ?? '').trim(),
      reference,
      // sourceRow 1-indexed respecto al archivo original (header incluido)
      sourceRow: i + 1,
    });
  }
  return out;
}
