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
 * Número de semana dentro del mes basado en el día del sábado (o cualquier
 * fecha). Cae en el mismo bucket todo el rango del mes:
 *   días  1-7  → Semana 1
 *   días  8-14 → Semana 2
 *   días 15-21 → Semana 3
 *   días 22-28 → Semana 4
 *   días 29-31 → Semana 5
 *
 * NOTA: no coincide con "semana ISO"; se usa la convención más natural para
 * clientes non-técnicos ("semana X del mes").
 */
export function weekNumberInMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
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
