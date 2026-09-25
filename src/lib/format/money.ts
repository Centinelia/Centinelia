/**
 * Formato consistente de dinero en Centinelia.
 *
 * Reglas:
 * - Locale es-MX (comas para miles, punto para decimales).
 * - 2 decimales siempre por default (money accounting-grade).
 * - Signo `$` prefijo, moneda MXN implícita (no imprime "MXN" salvo que se pida).
 * - null/undefined/NaN devuelve el fallback (default: '—').
 *
 * Ejemplos:
 *   formatMoney(1234.5)         → "$1,234.50"
 *   formatMoney(0)              → "$0.00"
 *   formatMoney(null)           → "—"
 *   formatMoney("2500")         → "$2,500.00"
 *   formatMoney(1500, { withCurrency: true })  → "$1,500.00 MXN"
 *   formatMoney(1234, { symbol: false })       → "1,234.00"
 */

export interface FormatMoneyOptions {
  /** Fallback si valor es null/undefined/NaN. Default: '—' */
  fallback?:     string;
  /** Incluir sufijo "MXN". Default: false */
  withCurrency?: boolean;
  /** Prepend "$". Default: true */
  symbol?:       boolean;
  /** Decimales mínimos y máximos. Default: 2 y 2 */
  minDecimals?:  number;
  maxDecimals?:  number;
}

export function formatMoney(
  value: number | string | null | undefined,
  opts: FormatMoneyOptions = {},
): string {
  const {
    fallback     = '—',
    withCurrency = false,
    symbol       = true,
    minDecimals  = 2,
    maxDecimals  = 2,
  } = opts;

  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;

  const formatted = n.toLocaleString('es-MX', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });

  return `${symbol ? '$' : ''}${formatted}${withCurrency ? ' MXN' : ''}`;
}

/**
 * Parsea un string "amigable" ($1,234.56 o "1234.56" o "1,234") a número.
 * Útil para leer valores de inputs de dinero.
 * Devuelve NaN si no es parseable.
 */
export function parseMoney(input: string): number {
  if (!input) return NaN;
  // Remueve símbolos y separadores de miles, deja el punto decimal
  const clean = input.replace(/[$\s,]/g, '');
  return Number(clean);
}
