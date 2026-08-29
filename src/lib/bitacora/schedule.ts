// Helpers para determinar cuándo el cron de bitácora semanal debe disparar.

/**
 * Retorna día de semana (0=domingo..6=sábado) y hora (0-23) en zona MX.
 * Vercel corre en UTC — sin este helper el cron dispararía en día/hora UTC,
 * que en MX (UTC-6) es 6 horas antes.
 */
export function nowInMX(): { dayOfWeek: number; hour: number; date: Date } {
  const now = new Date();
  const mxStr = now.toLocaleString('en-US', { timeZone: 'America/Monterrey' });
  const mxDate = new Date(mxStr);
  return {
    dayOfWeek: mxDate.getDay(),
    hour:      mxDate.getHours(),
    date:      mxDate,
  };
}

/**
 * True si el sábado dado es el último sábado del mes.
 * Un sábado es "el último del mes" si no hay otro sábado ≤ 7 días después
 * dentro del mismo mes (i.e. el próximo sábado cae ya en el mes siguiente).
 */
export function isLastSaturdayOfMonth(d: Date): boolean {
  if (d.getDay() !== 6) return false;
  const nextSat = new Date(d);
  nextSat.setDate(d.getDate() + 7);
  return nextSat.getMonth() !== d.getMonth();
}

/** Lunes 00:00 MX de la semana que contiene `date` (en la fecha MX). */
export function weekStartMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Día 1 00:00 MX del mes que contiene `date`. */
export function monthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Número de semana dentro del mes basado en el lunes de la semana Lun-Dom
 * que contiene la fecha. Semana 1 = semana que contiene el día 1 del mes.
 *
 * Ejemplo agosto 2026 (Aug 1 es sábado):
 *   Sáb Aug 1  (weekMonday Jul 27) → Semana 1
 *   Sáb Aug 8  (weekMonday Aug 3)  → Semana 2
 *   Sáb Aug 22 (weekMonday Aug 17) → Semana 4
 *   Vie Aug 28 (weekMonday Aug 24) → Semana 5
 *   Sáb Aug 29 (weekMonday Aug 24) → Semana 5
 *
 * Fórmula naïve `Math.floor((day-1)/7)+1` fallaba porque colocaba Aug 22 y
 * Aug 28 en el mismo bucket a pesar de ser semanas Lun-Dom distintas.
 */
export function weekNumberInMonth(date: Date): number {
  const firstOfMonth = new Date(date);
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);
  const firstWeekMonday = weekStartMonday(firstOfMonth);
  const thisWeekMonday  = weekStartMonday(date);
  const diffDays = Math.round((thisWeekMonday.getTime() - firstWeekMonday.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Lista los sábados del mes de `date` hasta y incluyendo `date` (si es sábado).
 * Se usa para saber cuántas semanas del mes tenemos que llenar en el archivo
 * persistente en el cron actual.
 */
export function saturdaysInMonthUpTo(date: Date): Date[] {
  const result: Date[] = [];
  const first = monthStart(date);
  // Primer sábado del mes
  const firstDay = first.getDay(); // 0=dom..6=sab
  const daysToFirstSat = (6 - firstDay + 7) % 7;
  const cursor = new Date(first);
  cursor.setDate(1 + daysToFirstSat);
  while (cursor <= date && cursor.getMonth() === first.getMonth()) {
    result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}
