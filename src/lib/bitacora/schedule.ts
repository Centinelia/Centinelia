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
