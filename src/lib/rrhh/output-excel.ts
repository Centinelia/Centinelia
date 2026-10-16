/**
 * Generador del Excel final de retardos para que Lucero lo anexe a su libro
 * de nómina ("es un Excel aparte, solo agrego la hoja al archivo").
 *
 * Hoja 1: Detalle diario — 1 fila por (empleado, día de la quincena).
 * Hoja 2: Resumen por empleado — totales de retardos/faltas y monto.
 * Hoja 3: Notas — fuente de datos, config aplicada, advertencias de parseo.
 */

import ExcelJS from 'exceljs';
import type { ClassifiedDay, Classification } from './retardo-classifier';

export interface EmployeeResult {
  relojId:  string;
  nombre:   string;
  dias:     ClassifiedDay[];     // 1 por día en el rango de la quincena
}

export interface OutputMetadata {
  fechaInicio:              string;  // YYYY-MM-DD
  fechaFin:                 string;  // YYYY-MM-DD
  horaEntrada:              string;
  umbralRetardoDobleMin:    number;
  umbralFaltaMin:           number;
  montoRetardoBase:         number | null;
  montoRetardoDoble:        number | null;
  montoFalta:               number | null;
  warnings:                 string[];
  totalEmpleadosProcesados: number;
  totalChecadasParsed:      number;
}

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  ok:                 'Puntual',
  retardo_base:       'Retardo',
  retardo_doble:      'Retardo doble',
  falta:              'Falta',
  checada_incompleta: 'Checada incompleta',
  descanso:           'Descanso',
  vacaciones:         'Vacaciones',
  festivo:            'Festivo',
};

function fmtHHMM(d: Date | null): string {
  if (!d) return '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function dayOfWeekEs(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00Z');
  return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getUTCDay()];
}

export async function generateNominaExcel(
  empleados: EmployeeResult[],
  meta:      OutputMetadata,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Centinelia · Naia';
  wb.created  = new Date();

  // ─── Hoja 1: Detalle diario ─────────────────────────────────────────────
  const detalle = wb.addWorksheet('Detalle diario');
  detalle.columns = [
    { header: 'Empleado',       key: 'nombre',     width: 32 },
    { header: 'ID Reloj',       key: 'relojId',    width: 12 },
    { header: 'Fecha',          key: 'fecha',      width: 12 },
    { header: 'Día',            key: 'dia',        width: 6  },
    { header: 'Entrada',        key: 'entrada',    width: 10 },
    { header: 'Clasificación',  key: 'clasif',     width: 16 },
    { header: 'Min desviación', key: 'minRetraso', width: 14 },
    { header: 'Monto',          key: 'monto',      width: 12 },
  ];
  detalle.getRow(1).font = { bold: true };
  detalle.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6C3BFF' } };
  detalle.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const emp of empleados) {
    for (const d of emp.dias) {
      detalle.addRow({
        nombre:     emp.nombre,
        relojId:    emp.relojId,
        fecha:      d.fecha,
        dia:        dayOfWeekEs(d.fecha),
        entrada:    fmtHHMM(d.checkIn),
        clasif:     CLASSIFICATION_LABELS[d.classification],
        minRetraso: d.minutosRetraso ?? '',
        monto:      d.monto ?? (['ok','descanso','vacaciones','festivo'].includes(d.classification) ? 0 : 'pendiente'),
      });
    }
  }

  // ─── Hoja 2: Resumen por empleado ────────────────────────────────────────
  const resumen = wb.addWorksheet('Resumen por empleado');
  resumen.columns = [
    { header: 'Empleado',          key: 'nombre',    width: 32 },
    { header: 'ID Reloj',          key: 'relojId',   width: 12 },
    { header: 'Puntuales',         key: 'ok',        width: 10 },
    { header: 'Retardos',          key: 'retB',      width: 10 },
    { header: 'Retardos dobles',   key: 'retD',      width: 14 },
    { header: 'Faltas',            key: 'falt',      width: 8  },
    { header: 'Checadas incompl.', key: 'inc',       width: 16 },
    { header: 'Descansos',         key: 'desc',      width: 10 },
    { header: 'Vacaciones',        key: 'vac',       width: 10 },
    { header: 'Festivos',          key: 'fest',      width: 10 },
    { header: 'Monto total',       key: 'total',     width: 14 },
  ];
  resumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6C3BFF' } };
  resumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const emp of empleados) {
    const count = (cls: Classification) => emp.dias.filter(d => d.classification === cls).length;
    const total = emp.dias.reduce((acc, d) => acc + (d.monto ?? 0), 0);
    const hayPendiente = emp.dias.some(d => d.monto === null && (d.classification === 'retardo_base' || d.classification === 'retardo_doble' || d.classification === 'falta'));
    resumen.addRow({
      nombre:  emp.nombre,
      relojId: emp.relojId,
      ok:      count('ok'),
      retB:    count('retardo_base'),
      retD:    count('retardo_doble'),
      falt:    count('falta'),
      inc:     count('checada_incompleta'),
      desc:    count('descanso'),
      vac:     count('vacaciones'),
      fest:    count('festivo'),
      total:   hayPendiente ? 'pendiente' : total,
    });
  }

  // ─── Hoja 3: Notas ───────────────────────────────────────────────────────
  const notas = wb.addWorksheet('Notas');
  notas.columns = [
    { header: 'Campo',  key: 'k', width: 28 },
    { header: 'Valor',  key: 'v', width: 60 },
  ];
  notas.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6C3BFF' } };
  notas.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  notas.addRow({ k: 'Quincena procesada',          v: `${meta.fechaInicio} a ${meta.fechaFin}` });
  notas.addRow({ k: 'Hora oficial de entrada',     v: meta.horaEntrada });
  notas.addRow({ k: 'Umbral retardo doble',        v: `${meta.umbralRetardoDobleMin} min después de la hora de entrada` });
  notas.addRow({ k: 'Umbral falta',                v: `${meta.umbralFaltaMin} min después de la hora de entrada` });
  notas.addRow({ k: 'Monto retardo base',          v: meta.montoRetardoBase  === null ? 'pendiente' : `$${meta.montoRetardoBase.toFixed(2)}` });
  notas.addRow({ k: 'Monto retardo doble',         v: meta.montoRetardoDoble === null ? 'pendiente' : `$${meta.montoRetardoDoble.toFixed(2)}` });
  notas.addRow({ k: 'Monto falta',                 v: meta.montoFalta        === null ? 'pendiente' : `$${meta.montoFalta.toFixed(2)}` });
  notas.addRow({ k: 'Empleados procesados',        v: meta.totalEmpleadosProcesados });
  notas.addRow({ k: 'Checadas parseadas',          v: meta.totalChecadasParsed });
  if (meta.warnings.length) {
    notas.addRow({ k: '', v: '' });
    notas.addRow({ k: 'Advertencias de parseo', v: '' });
    for (const w of meta.warnings) notas.addRow({ k: '', v: w });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
