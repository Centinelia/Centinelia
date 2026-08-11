// Timezone helpers para billing cycles (fix H3+H4 audit 2026-08-10).
//
// Contexto: Vercel crons corren en UTC. Los clientes están en México
// (UTC-6). Comparar `pool_reset_date < today_utc` produce boundary errors:
// una llamada a las 11pm hora MTY del último día del ciclo se contabiliza
// como próximo ciclo en UTC (00:00 UTC+1 = 6pm MTY del último día).
//
// Fix: comparar en tz Mexico_City. `nextResetDateInMexico` genera fechas
// alineadas al calendario local.
//
// Limitación: no respeta `billing_cycle_anchor` per-cliente (todos resetean
// día 1 del mes). Para full support anchor-day, requiere columna nueva en
// organizations (organizations.billing_anchor_day int) + backfill desde
// Stripe subscription.current_period_start. Deferred a próxima iteración.

const MEXICO_TZ = 'America/Mexico_City';

/**
 * Retorna YYYY-MM-DD en zona horaria de México.
 * Ejemplo: si son las 11:30pm CDMX del 15 de agosto (05:30 UTC del 16), retorna "2026-08-15".
 */
export function todayInMexico(): string {
  const now  = new Date();
  const fmt  = new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now); // en-CA da formato ISO YYYY-MM-DD por default
}

/**
 * Retorna la fecha del PRIMER día del PRÓXIMO mes calendario, en tz México.
 * Usado para setear `minutes_reset_date` y `pool_reset_date`.
 */
export function nextResetDateInMexico(): string {
  const today = new Date();
  const fmt   = new Intl.DateTimeFormat('en-CA', { timeZone: MEXICO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  // Extraer año/mes actuales en tz México.
  const parts = fmt.formatToParts(today);
  const y = parseInt(parts.find(p => p.type === 'year')!.value);
  const m = parseInt(parts.find(p => p.type === 'month')!.value);
  // Próximo mes calendario, día 1.
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear  = m === 12 ? y + 1 : y;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}
