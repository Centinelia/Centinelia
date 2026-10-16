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
  | 'ok'                 // Puntual (modo admin: check-in <= hora_entrada; modo turno: tiempo_trabajado >= requerido)
  | 'retardo_base'       // Modo admin: 1 min a umbralRetardoDoble-1 después de hora_entrada; Modo turno: 1-30 min faltantes del turno
  | 'retardo_doble'      // Modo admin: umbralRetardoDoble a umbralFalta-1; Modo turno: 30-90 min faltantes
  | 'falta'              // Modo admin: >= umbralFalta o sin checada; Modo turno: > 90 min faltantes o sin checadas
  | 'checada_incompleta' // Regla transversal: solo checó entrada o solo salida (no las dos). Rebaje fijo configurable.
  | 'descanso'           // Día marcado como descanso para ese empleado
  | 'vacaciones'         // Día dentro de rango de vacaciones autorizadas
  | 'festivo';           // Día en calendario LFT

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
export interface MontosEmpleado {
  /** Sueldo diario en pesos. Si está presente, se usa como monto de la falta. */
  sueldoDiario?:  number | null;
  /** Override del monto de retardo base. Si está presente, gana sobre montos.retardoBase global. */
  retardoBase?:   number | null;
  /** Override del monto de retardo doble. Si está presente, gana sobre montos.retardoDoble global. */
  retardoDoble?:  number | null;
}

export function classifyDay(
  fecha:    string,                        // 'YYYY-MM-DD'
  checkIn:  Date | null,
  rules:    ClassificationRules,
  montos:   ClassificationMontos,
  context:  DayContext,
  /** Overrides per-empleado. Si cualquier campo está presente (no null/undefined), gana sobre el valor global de montos. */
  empleado: MontosEmpleado | number | null = null,
): ClassifiedDay {
  // Backwards compat: si llega number directo o null, se interpreta como sueldoDiario (comportamiento legacy).
  const emp: MontosEmpleado = typeof empleado === 'number' || empleado === null
    ? { sueldoDiario: empleado }
    : empleado;
  const montoFaltaEfectivo        = emp.sueldoDiario  ?? montos.falta;
  const montoRetardoBaseEfectivo  = emp.retardoBase   ?? montos.retardoBase;
  const montoRetardoDobleEfectivo = emp.retardoDoble  ?? montos.retardoDoble;

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
    return { fecha, classification: 'retardo_base', minutosRetraso: delta, monto: montoRetardoBaseEfectivo,  checkIn };
  }
  if (delta < rules.umbralFaltaMin) {
    return { fecha, classification: 'retardo_doble', minutosRetraso: delta, monto: montoRetardoDobleEfectivo, checkIn };
  }
  return   { fecha, classification: 'falta',         minutosRetraso: delta, monto: montoFaltaEfectivo,        checkIn };
}

/** Devuelve la primera checada del día para una lista de timestamps ordenada. */
export function firstCheckInOfDay(timestamps: Date[]): Date | null {
  if (!timestamps.length) return null;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  return sorted[0];
}

/** Devuelve la última checada del día para una lista de timestamps ordenada. */
export function lastCheckOutOfDay(timestamps: Date[]): Date | null {
  if (!timestamps.length) return null;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  return sorted[sorted.length - 1];
}

// ─── Modo "turno cubierto" (operativos AC) ─────────────────────────────────
// Reglas Lucero 2026-10-15/16:
// - tiempo_trabajado = ultima_checada - primera_checada
// - Si cubre horas_requeridas → OK
// - Si no cubre, minutos faltantes disparan escalonado:
//   1-30 min: retardo_base (ej. $50)
//   30-90 min: retardo_doble (ej. $100)
//   90+ min: falta (sueldo diario)
// - Sin checadas = falta.
// - Si solo 1 checada en el día → regla transversal "checada_incompleta"
//   (se aplica en process-quincena como override post-clasificación, no aquí).

export interface TurnoCubiertoRules {
  /** Horas requeridas del turno (ej. 12 operativos, 10 Alberto, 4 Amelia). */
  horasRequeridas:        number;
  /** Minutos faltantes a partir de los cuales el rebaje pasa a doble. Default 30 (iguala a admin AC). */
  umbralRetardoDobleMin:  number;
  /** Minutos faltantes a partir de los cuales ya es falta. Default 90. */
  umbralFaltaMin:         number;
}

export function classifyDayTurnoCubierto(
  fecha:        string,
  entrada:      Date | null,
  salida:       Date | null,
  rules:        TurnoCubiertoRules,
  montos:       ClassificationMontos,
  context:      DayContext,
  empleado:     MontosEmpleado | null = null,
): ClassifiedDay {
  const emp: MontosEmpleado = empleado ?? {};
  const montoFaltaEfectivo        = emp.sueldoDiario ?? montos.falta;
  const montoRetardoBaseEfectivo  = emp.retardoBase  ?? montos.retardoBase;
  const montoRetardoDobleEfectivo = emp.retardoDoble ?? montos.retardoDoble;

  // Precedencia: festivo > vacaciones > descanso. Igual que admin.
  if (context.isFestivo)  return { fecha, classification: 'festivo',    minutosRetraso: null, monto: null, checkIn: entrada };
  if (context.isVacacion) return { fecha, classification: 'vacaciones', minutosRetraso: null, monto: null, checkIn: entrada };
  if (context.isDescanso) return { fecha, classification: 'descanso',   minutosRetraso: null, monto: null, checkIn: entrada };

  // Sin ninguna checada = falta.
  if (!entrada && !salida) {
    return { fecha, classification: 'falta', minutosRetraso: null, monto: montoFaltaEfectivo, checkIn: null };
  }

  // Checada incompleta (solo 1): se marca con la clasificación especial y el
  // orquestador decide el monto en process-quincena (porque depende de
  // configuración per-empleado). Aquí minutosRetraso queda null porque no
  // podemos calcular tiempo trabajado sin ambas checadas.
  if (!entrada || !salida) {
    return { fecha, classification: 'checada_incompleta', minutosRetraso: null, monto: null, checkIn: entrada ?? salida };
  }

  // Ambas checadas presentes: calcula tiempo trabajado.
  const minutosTrabajados = Math.round((salida.getTime() - entrada.getTime()) / 60000);
  const minutosRequeridos = Math.round(rules.horasRequeridas * 60);
  const minutosFaltantes  = minutosRequeridos - minutosTrabajados;

  if (minutosFaltantes <= 0) {
    return { fecha, classification: 'ok', minutosRetraso: 0, monto: 0, checkIn: entrada };
  }
  if (minutosFaltantes < rules.umbralRetardoDobleMin) {
    return { fecha, classification: 'retardo_base',  minutosRetraso: minutosFaltantes, monto: montoRetardoBaseEfectivo,  checkIn: entrada };
  }
  if (minutosFaltantes < rules.umbralFaltaMin) {
    return { fecha, classification: 'retardo_doble', minutosRetraso: minutosFaltantes, monto: montoRetardoDobleEfectivo, checkIn: entrada };
  }
  return   { fecha, classification: 'falta',         minutosRetraso: minutosFaltantes, monto: montoFaltaEfectivo,        checkIn: entrada };
}

export { dateOnly };
