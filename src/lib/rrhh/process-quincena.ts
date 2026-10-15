/**
 * Orquestador: toma un Excel exportado del reloj + metadata de la quincena +
 * config/catálogos de la org, y devuelve el Excel final listo para Lucero.
 *
 * No hace IO de red por sí mismo. Recibe un SupabaseClient ya autenticado
 * (service_role) y hace todas las queries necesarias.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseBioCheckExcel, type BioCheckRow } from './parser-biocheck';
import {
  classifyDay,
  firstCheckInOfDay,
  dateOnly,
  type ClassificationRules,
  type ClassificationMontos,
  type ClassifiedDay,
} from './retardo-classifier';
import { generateNominaExcel, type EmployeeResult, type OutputMetadata } from './output-excel';

export interface ProcesarQuincenaInput {
  portalEmail:  string;
  excelBuffer:  Buffer;
  fechaInicio:  string;              // YYYY-MM-DD inclusive
  fechaFin:     string;              // YYYY-MM-DD inclusive
  supabase:     SupabaseClient;
}

export interface ProcesarQuincenaOutput {
  excelBuffer:          Buffer;
  resumen: {
    totalEmpleados:     number;
    totalChecadas:      number;
    totalRetardos:      number;
    totalFaltas:        number;
    totalMontoCalculado:number | null;    // null si config incompleta
    pendienteDeMontos:  boolean;
    warnings:           string[];
  };
}

interface EmpleadoRow {
  id:                      string;
  reloj_id:                string;
  nombre:                  string;
  hora_entrada:            string;
  sueldo_diario_mxn:       number | null;
  monto_retardo_base_mxn:  number | null;
  monto_retardo_doble_mxn: number | null;
  activo:                  boolean;
}

interface DescansoRow {
  empleado_id:  string;
  anio:         number;
  mes:          number;
  fechas:       string[];
}

interface VacacionesRow {
  empleado_id:  string;
  fecha_inicio: string;
  fecha_fin:    string;
}

interface ConfigRow {
  hora_entrada_default:     string;
  umbral_retardo_doble_min: number;
  umbral_falta_min:         number;
  monto_retardo_base:       number | null;
  monto_retardo_doble:      number | null;
  monto_falta:              number | null;
  activo:                   boolean;
}

function datesInRange(inicio: string, fin: string): string[] {
  const out: string[] = [];
  const d = new Date(inicio + 'T00:00:00Z');
  const end = new Date(fin + 'T00:00:00Z');
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function procesarQuincena(input: ProcesarQuincenaInput): Promise<ProcesarQuincenaOutput> {
  const { portalEmail, excelBuffer, fechaInicio, fechaFin, supabase } = input;

  // 1. Parse Excel
  const parsed = await parseBioCheckExcel(excelBuffer);
  const warnings: string[] = [...parsed.warnings];

  // 2. Catálogos: config, empleados, descansos, vacaciones, festivos
  const [cfgRes, empRes, festRes] = await Promise.all([
    supabase.from('rrhh_nomina_config').select('*').eq('portal_email', portalEmail).maybeSingle(),
    supabase.from('rrhh_empleados').select('id, reloj_id, nombre, hora_entrada, sueldo_diario_mxn, monto_retardo_base_mxn, monto_retardo_doble_mxn, activo').eq('portal_email', portalEmail).eq('activo', true),
    supabase.from('rrhh_festivos_mx_lft').select('fecha').gte('fecha', fechaInicio).lte('fecha', fechaFin),
  ]);

  const config  = (cfgRes.data as ConfigRow | null) ?? null;
  const empleados = (empRes.data as EmpleadoRow[] | null) ?? [];
  const festivos  = new Set(((festRes.data ?? []) as { fecha: string }[]).map(r => r.fecha));

  if (!config) {
    warnings.push(`No hay rrhh_nomina_config para ${portalEmail}. Se usan defaults (8:00 / 30 / 90) y montos pendientes.`);
  }

  const defaultConfig: ConfigRow = {
    hora_entrada_default:     '08:00',
    umbral_retardo_doble_min: 30,
    umbral_falta_min:         90,
    monto_retardo_base:       null,
    monto_retardo_doble:      null,
    monto_falta:              null,
    activo:                   true,
  };
  const cfg = config ?? defaultConfig;

  const empleadoIds = empleados.map(e => e.id);
  const [descRes, vacRes] = empleadoIds.length ? await Promise.all([
    supabase.from('rrhh_descansos_mensuales')
      .select('empleado_id, anio, mes, fechas')
      .in('empleado_id', empleadoIds),
    supabase.from('rrhh_vacaciones')
      .select('empleado_id, fecha_inicio, fecha_fin')
      .in('empleado_id', empleadoIds)
      .lte('fecha_inicio', fechaFin)
      .gte('fecha_fin',    fechaInicio),
  ]) : [{ data: [] }, { data: [] }];

  const descansos  = (descRes.data as DescansoRow[]   | null) ?? [];
  const vacaciones = (vacRes.data  as VacacionesRow[] | null) ?? [];

  // Index helpers
  const empleadoByReloj = new Map<string, EmpleadoRow>();
  for (const e of empleados) empleadoByReloj.set(e.reloj_id, e);

  const descansoSet = new Set<string>();  // key: `${empleadoId}|${fecha}`
  for (const d of descansos) {
    for (const f of d.fechas) descansoSet.add(`${d.empleado_id}|${f}`);
  }

  function isVacacion(empId: string, fecha: string): boolean {
    return vacaciones.some(v =>
      v.empleado_id === empId && v.fecha_inicio <= fecha && fecha <= v.fecha_fin
    );
  }

  // 3. Agrupar checadas por reloj_id y fecha
  const rangoFechas = datesInRange(fechaInicio, fechaFin);
  const checadasPorEmpleado = new Map<string, Map<string, Date[]>>();   // reloj_id → fecha → [timestamps]

  for (const row of parsed.rows) {
    const fechaStr = dateOnly(row.dateTime);
    if (fechaStr < fechaInicio || fechaStr > fechaFin) continue;        // fuera del rango
    let perEmp = checadasPorEmpleado.get(row.relojId);
    if (!perEmp) { perEmp = new Map(); checadasPorEmpleado.set(row.relojId, perEmp); }
    let perDay = perEmp.get(fechaStr);
    if (!perDay) { perDay = []; perEmp.set(fechaStr, perDay); }
    perDay.push(row.dateTime);
  }

  // 4. Para cada empleado activo, clasificar cada día del rango
  const resultados: EmployeeResult[] = [];
  const relojIdsSinMatch = new Set<string>();

  for (const [relojId, perEmp] of checadasPorEmpleado) {
    if (!empleadoByReloj.has(relojId)) relojIdsSinMatch.add(relojId);
  }
  for (const r of relojIdsSinMatch) {
    warnings.push(`Reloj ID "${r}" tiene checadas pero no está dado de alta en rrhh_empleados.`);
  }

  const montos: ClassificationMontos = {
    retardoBase:  cfg.monto_retardo_base,
    retardoDoble: cfg.monto_retardo_doble,
    falta:        cfg.monto_falta,
  };

  for (const emp of empleados) {
    const rules: ClassificationRules = {
      horaEntrada:           emp.hora_entrada || cfg.hora_entrada_default,
      umbralRetardoDobleMin: cfg.umbral_retardo_doble_min,
      umbralFaltaMin:        cfg.umbral_falta_min,
    };
    const dias: ClassifiedDay[] = [];
    const perEmp = checadasPorEmpleado.get(emp.reloj_id);
    for (const fecha of rangoFechas) {
      const checadas = perEmp?.get(fecha) ?? [];
      const checkIn  = firstCheckInOfDay(checadas);
      const classified = classifyDay(fecha, checkIn, rules, montos, {
        isFestivo:  festivos.has(fecha),
        isDescanso: descansoSet.has(`${emp.id}|${fecha}`),
        isVacacion: isVacacion(emp.id, fecha),
      }, {
        sueldoDiario: emp.sueldo_diario_mxn,
        retardoBase:  emp.monto_retardo_base_mxn,
        retardoDoble: emp.monto_retardo_doble_mxn,
      });
      dias.push(classified);
    }
    resultados.push({ relojId: emp.reloj_id, nombre: emp.nombre, dias });
  }

  // 5. Build output
  const meta: OutputMetadata = {
    fechaInicio,
    fechaFin,
    horaEntrada:              cfg.hora_entrada_default,
    umbralRetardoDobleMin:    cfg.umbral_retardo_doble_min,
    umbralFaltaMin:           cfg.umbral_falta_min,
    montoRetardoBase:         cfg.monto_retardo_base,
    montoRetardoDoble:        cfg.monto_retardo_doble,
    montoFalta:               cfg.monto_falta,
    warnings,
    totalEmpleadosProcesados: resultados.length,
    totalChecadasParsed:      parsed.rows.length,
  };

  const excelBufferOut = await generateNominaExcel(resultados, meta);

  // 6. Resumen
  let totalRetardos = 0;
  let totalFaltas   = 0;
  let totalMonto    = 0;
  let pendiente     = false;
  for (const emp of resultados) {
    for (const d of emp.dias) {
      if (d.classification === 'retardo_base' || d.classification === 'retardo_doble') totalRetardos++;
      if (d.classification === 'falta') totalFaltas++;
      if (d.monto === null && ['retardo_base','retardo_doble','falta'].includes(d.classification)) pendiente = true;
      if (typeof d.monto === 'number') totalMonto += d.monto;
    }
  }

  return {
    excelBuffer: excelBufferOut,
    resumen: {
      totalEmpleados:      resultados.length,
      totalChecadas:       parsed.rows.length,
      totalRetardos,
      totalFaltas,
      totalMontoCalculado: pendiente ? null : totalMonto,
      pendienteDeMontos:   pendiente,
      warnings,
    },
  };
}
