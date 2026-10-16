/**
 * Smoke E2E: valida el override de descansos autorizados y vacaciones vs
 * clasificaciones de retardo/falta. Gap que el smoke-rrhh-4-grupos no cubre.
 *
 * Caso: 1 empleado admin (SMK-D). Rango 2026-10-05 a 2026-10-09.
 *   Lun 05: puntual (ok)
 *   Mar 06: SIN CHECADAS pero marcado como DESCANSO → no falta
 *   Mié 07: SIN CHECADAS pero marcado como VACACIONES → no falta
 *   Jue 08: solo entrada 07:55 (checada incompleta, pero este día es FESTIVO ficticio)
 *   Vie 09: checa 08:15 → retardo
 *
 * Nota: El festivo lo probamos con una fecha real de festivo LFT (ya seedada):
 *   2026-11-16 día de la revolución (lun). Mejor: usar 2026-09-16 (independencia)
 *   que está dentro de nuestros festivos seedados.
 *
 * Idempotente: cleanup inicial + final.
 *
 * Uso: npx tsx _smoke/smoke-rrhh-descansos-vacaciones.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { executeRrhhTool } from '../src/lib/tools/executors/rrhh';
import type { AgentToolContext } from '../src/lib/tools/executor';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const PORTAL_EMAIL = 'camila@acproyectos.com';
const BUCKET       = 'rrhh-reloj';
const RELOJ_ID     = 'SMK-DV';   // Smoke Descansos Vacaciones
const NOMBRE       = 'SMOKE DESC VAC EMPLEADO';
const SUELDO       = 500;

// Rango que incluye el festivo LFT 16-sep.
const FECHA_INI    = '2026-09-14';   // Lun
const FECHA_FIN    = '2026-09-18';   // Vie
const SMOKE_PATH   = `smoke-dv/${PORTAL_EMAIL}/biocheck-dv-${Date.now()}.xlsx`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('[smoke-dv] FAIL:', msg); process.exit(1); }
}

function at(fecha: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, 0));
}

async function buildExcel(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('AttLog');
  ws.addRow(['No', 'Name', 'Time']);
  // Lun 14: 07:55 + 17:00 (puntual, 2 checadas)
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-09-14', '07:55')]);
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-09-14', '17:00')]);
  // Mar 15: sin checadas (lo marcaremos como DESCANSO autorizado)
  // Mié 16: sin checadas (es FESTIVO LFT, ya seedado 2026-09-16 Independencia)
  // Jue 17: sin checadas (lo marcaremos como VACACIONES)
  // Vie 18: 08:15 + 17:00 (retardo_base $200)
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-09-18', '08:15')]);
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-09-18', '17:00')]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

interface Expected { fecha: string; classification: string; monto: number }

const EXPECTED: Expected[] = [
  { fecha: '2026-09-14', classification: 'Puntual',    monto: 0 },
  { fecha: '2026-09-15', classification: 'Descanso',   monto: 0 },   // SIN checadas pero marcado descanso → no cuenta
  { fecha: '2026-09-16', classification: 'Festivo',    monto: 0 },   // festivo LFT, no cuenta aunque no haya checada
  { fecha: '2026-09-17', classification: 'Vacaciones', monto: 0 },   // marcado vacaciones → no cuenta
  { fecha: '2026-09-18', classification: 'Retardo',    monto: 200 }, // retardo normal
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta env'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const ctx = {
    agentId: 'smoke-dv', portalEmail: PORTAL_EMAIL, agentName: 'Smoke', businessName: 'AC',
    portalToken: '', agent: {}, supabase,
  } as unknown as AgentToolContext;

  console.log('[smoke-dv] ─── Cleanup previo ──────────────────────────');
  await supabase.from('rrhh_empleados').delete().eq('portal_email', PORTAL_EMAIL).eq('reloj_id', RELOJ_ID);

  console.log('[smoke-dv] ─── 1. Alta empleado admin ficticio ────────');
  const r1 = await executeRrhhTool('rrhh_registrar_empleado', {
    reloj_id: RELOJ_ID, nombre: NOMBRE, hora_entrada: '08:00', sueldo_diario: SUELDO,
    nota: 'smoke descansos+vacaciones',
  }, ctx) as { ok: boolean; message?: string; error?: string };
  assert(r1.ok, `alta: ${r1.error}`);
  console.log(`   ${r1.message}`);

  console.log('[smoke-dv] ─── 2. Registrar descanso 2026-09-15 ───────');
  const r2 = await executeRrhhTool('rrhh_registrar_descansos_mensuales', {
    anio: 2026, mes: 9, descansos: [{ reloj_id: RELOJ_ID, fechas: ['2026-09-15'] }],
  }, ctx) as { ok: boolean; message?: string; error?: string };
  assert(r2.ok, `descansos: ${r2.error}`);
  console.log(`   ${r2.message}`);

  console.log('[smoke-dv] ─── 3. Registrar vacaciones 2026-09-17 ─────');
  const r3 = await executeRrhhTool('rrhh_registrar_vacaciones_autorizadas', {
    reloj_id: RELOJ_ID, fecha_inicio: '2026-09-17', fecha_fin: '2026-09-17', nota: 'smoke-dv',
  }, ctx) as { ok: boolean; message?: string; error?: string };
  assert(r3.ok, `vacaciones: ${r3.error}`);
  console.log(`   ${r3.message}`);

  console.log('[smoke-dv] ─── 4. Upload Excel sintético ──────────────');
  const buf = await buildExcel();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(SMOKE_PATH, buf, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true });
  assert(!upErr, `upload: ${upErr?.message}`);

  console.log('[smoke-dv] ─── 5. Procesar quincena ─────────────────');
  const procRes = await executeRrhhTool('rrhh_procesar_quincena_desde_excel', {
    excel_url: `${BUCKET}/${SMOKE_PATH}`, fecha_inicio: FECHA_INI, fecha_fin: FECHA_FIN,
  }, ctx) as { ok: boolean; message?: string; download_url?: string };
  assert(procRes.ok, `procesar: ${procRes.message}`);
  assert(procRes.download_url, 'sin download_url');
  console.log(`   ${procRes.message}`);

  console.log('[smoke-dv] ─── 6. Descargar + verificar ───────────────');
  const res = await fetch(procRes.download_url);
  assert(res.ok, `download HTTP ${res.status}`);
  const outBuf = Buffer.from(await res.arrayBuffer());
  const wbOut = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wbOut.xlsx.load(outBuf as any);
  const detalle = wbOut.getWorksheet('Detalle diario');
  assert(detalle, 'hoja Detalle diario missing');

  const byFecha = new Map<string, { clasif: string; monto: unknown }>();
  detalle.eachRow((row, r) => {
    if (r === 1) return;
    const relojId = String(row.getCell(2).value ?? '');
    if (relojId !== RELOJ_ID) return;
    const fecha  = String(row.getCell(3).value ?? '');
    const clasif = String(row.getCell(6).value ?? '');
    const monto  = row.getCell(8).value;
    byFecha.set(fecha, { clasif, monto });
  });

  let failures = 0;
  for (const exp of EXPECTED) {
    const got = byFecha.get(exp.fecha);
    if (!got) { console.error(`   ✗ ${exp.fecha}: fila no encontrada`); failures++; continue; }
    const match = got.clasif === exp.classification && Number(got.monto) === exp.monto;
    console.log(`   ${match ? '✓' : '✗'} ${exp.fecha}  esperado: ${exp.classification} $${exp.monto}  obtuve: ${got.clasif} $${got.monto}`);
    if (!match) failures++;
  }

  console.log('[smoke-dv] ─── 7. Cleanup final ──────────────────────');
  // CASCADE borra descansos + vacaciones del empleado.
  await supabase.from('rrhh_empleados').delete().eq('portal_email', PORTAL_EMAIL).eq('reloj_id', RELOJ_ID);
  await supabase.storage.from(BUCKET).remove([SMOKE_PATH]);

  if (failures) { console.error(`\n[smoke-dv] ✗ ${failures} fallos.`); process.exit(1); }
  console.log('\n[smoke-dv] ✓ TODO PASÓ. Descansos + vacaciones + festivos LFT overriden correctamente.');
}

main().catch(err => { console.error(err); process.exit(1); });
