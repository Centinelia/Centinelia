/**
 * Clasificador de asistencia diaria por empleado.
 *
 * Reglas AC Proyectos (Lucero Longoria 2026-10-13):
 *   - Entrada oficial 08:00
 *   - Cero tolerancia: 08:01 ya es retardo
 *   - Pasando 08:30 el retardo va al doble
 *   - 09:30 en adelante es falta
 *   - Festivos LFT: no se contabilizan
 *   - Descansos mensuales por jefe de depto: no se contabilizan
 *   - Vacaciones autorizadas: no se contabilizan
 *
 * Montos per-org en rrhh_nomina_config. Si están NULL, el clasificador
 * devuelve `null` en el monto y el output lo deja marcado como "pendiente".
 */

export type Classification =
  | 'ok'              // Checó puntual (<= hora_entrada)
  | 'retardo_base'    // Entre hora_entrada + 1 min y hora_entrada + umbralRetardoDoble - 1
  | 'retardo_doble'   // Entre hora_entrada + umbralRetardoDoble y hora_entrada + umbralFalta - 1
  | 'falta'           // Entrada posterior a hora_entrada + umbralFalta, o sin checada en día laborable
  | 'descanso'        // Día marcado como descanso para ese empleado
  | 'vacaciones'      // Día dentro de rango de vacaciones autorizadas
  | 'festivo';        // Día en calendario LFT

export interface ClassificationRules {
  /** "HH:MM" en zona local. */
  horaEntrada:              string;
  /** Minutos tras hora_entrada en que el retardo pasa a doble (AC: 30). */
  umbralRetardoDobleMin:    number;
  /** Minutos tras hora_entrada en que ya es falta (AC: 90). */
  umbralFaltaMin:           number;
}

export interface ClassificationMontos {
  retardoBase:  number | null;
  retardoDoble: number | null;
  /** Fallback global cuando el empleado no tiene sueldo_diario capturado. En AC Proyectos lo normal es que cada empleado tenga su sueldo diario y el fallback no se use. */
  falta:        number | null;
}

export interface DayContext {
  isFestivo:    boolean;
  isDescanso:   boolean;
  isVacacion:   boolean;
}

export interface ClassifiedDay {
  fecha:            string;              // 'YYYY-MM-DD'
  classification:   Classification;
  minutosRetraso:   number | null;       // null si no aplica
  monto:            number | null;       // null si config monto es NULL o clasificación es ok/descanso/vacaciones/festivo
  checkIn:          Date | null;         // primera checada del día si existe
}

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(n => parseInt(n, 10));
  return { h: isFinite(h) ? h : 8, m: isFinite(m) ? m : 0 };
}

function dateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Clasifica un día específico para un empleado. `checkIn` es la primera
 * checada del día (null si no checó). Context indica si el día es festivo /
 * descanso / vacación (precedencia: festivo > vacaciones > descanso > checada).
 */
export function classifyDay(
  fecha:    string,                        // 'YYYY-MM-DD'
  checkIn:  Date | null,
  rules:    ClassificationRules,
  montos:   ClassificationMontos,
  context:  DayContext,
  /** Sueldo diario del empleado en pesos. Si está presente, se usa como monto de la falta (prioridad sobre montos.falta global). Si es null/undefined, cae al fallback. */
  sueldoDiarioEmpleado?: number | null,
): ClassifiedDay {
  const montoFaltaEfectivo = sueldoDiarioEmpleado ?? montos.falta;

  // Precedencia: festivo > vacaciones > descanso. Esos días no cuentan ni retardo ni falta.
  if (context.isFestivo)  return { fecha, classification: 'festivo',    minutosRetraso: null, monto: null, checkIn };
  if (context.isVacacion) return { fecha, classification: 'vacaciones', minutosRetraso: null, monto: null, checkIn };
  if (context.isDescanso) return { fecha, classification: 'descanso',   minutosRetraso: null, monto: null, checkIn };

  // Sin checada en día laborable = falta.
  if (!checkIn) {
    return {
      fecha,
      classification: 'falta',
      minutosRetraso: null,
      monto:          montoFaltaEfectivo,
      checkIn:        null,
    };
  }

  // Minutos desde hora_entrada.
  const { h, m } = parseHM(rules.horaEntrada);
  const entradaMin = h * 60 + m;
  const checkMin   = checkIn.getUTCHours() * 60 + checkIn.getUTCMinutes();
  const delta      = checkMin - entradaMin;

  if (delta <= 0) {
    return { fecha, classification: 'ok',           minutosRetraso: 0,     monto: 0,                  checkIn };
  }
  if (delta < rules.umbralRetardoDobleMin) {
    return { fecha, classification: 'retardo_base', minutosRetraso: delta, monto: montos.retardoBase, checkIn };
  }
  if (delta < rules.umbralFaltaMin) {
    return { fecha, classification: 'retardo_doble', minutosRetraso: delta, monto: montos.retardoDoble, checkIn };
  }
  return   { fecha, classification: 'falta',        minutosRetraso: delta, monto: montoFaltaEfectivo,  checkIn };
}

/** Devuelve la primera checada del día para una lista de timestamps ordenada. */
export function firstCheckInOfDay(timestamps: Date[]): Date | null {
  if (!timestamps.length) return null;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  return sorted[0];
}

export { dateOnly };
