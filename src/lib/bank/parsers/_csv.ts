// Mini CSV splitter con delimitador configurable y respeto a quotes.
// No importamos excel-io/read.parseCsvText porque hardcodea coma; los bancos
// MX (BBVA/Banorte) exportan ocasionalmente con `;` por regionalismo Excel.

export function splitCsvLine(line: string, delimiter: ',' | ';' | '|' | '\t'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Detecta el delimitador probable del CSV mirando la primera línea no vacía.
 * Elige el que aparezca más veces entre los soportados.
 */
export function detectDelimiter(line: string): ',' | ';' | '|' | '\t' {
  const counts: Record<',' | ';' | '|' | '\t', number> = {
    ',': 0, ';': 0, '|': 0, '\t': 0,
  };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (ch === ',' || ch === ';' || ch === '|' || ch === '\t') counts[ch]++;
  }
  const entries = Object.entries(counts) as Array<[',' | ';' | '|' | '\t', number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : ',';
}

/** Divide texto en líneas (CRLF/CR/LF) y elimina las vacías. */
export function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0);
}

/**
 * Normaliza string de monto es-MX a número.
 * Acepta: "1,234.56" | "1234.56" | "" | "0" | "-500.00" | "$1,234".
 * Devuelve 0 para vacío/basura — el caller decide si eso cuenta como skip.
 */
export function parseAmountMx(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const trimmed = String(raw).trim();
  if (trimmed === '' || trimmed === '-') return 0;
  const cleaned = trimmed.replace(/\$/g, '').replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parsea DD/MM/YYYY o DD-MM-YYYY → Date UTC naive del día local MX.
 * Devuelve null si inválido (no es ni rechaza por rango absurdo — eso lo
 * decide validación posterior).
 */
export function parseDateDmy(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Rechaza días imposibles tipo 31/02 que JS auto-corrige a marzo
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1 || dt.getUTCFullYear() !== y) return null;
  return dt;
}

/**
 * Encuentra el índice de columna cuyo header normalizado matchea alguno de
 * los sinónimos dados. Devuelve -1 si no encuentra. Case/accent insensitive.
 */
export function findColumn(headers: string[], synonyms: string[]): number {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const normalizedHeaders = headers.map(norm);
  const normalizedSyn = synonyms.map(norm);
  for (let i = 0; i < normalizedHeaders.length; i++) {
    if (normalizedSyn.some((s) => normalizedHeaders[i] === s || normalizedHeaders[i].includes(s))) {
      return i;
    }
  }
  return -1;
}
