/**
 * Smoke E2E Fase 2a.2 contra prod: valida los 4 modelos de cálculo con
 * empleados ficticios + Excel sintético con casos conocidos por grupo.
 *
 * Grupos probados:
 *   A. Admin estándar (hora 8:00, umbrales 30/90, $200/$400)
 *   B. Admin hora distinta (Omar, hora 9:00)
 *   C. Operativo turno 12h ($50/$100 por minutos faltantes)
 *   D. Operativo turno 10h (Alberto, mismo que C pero 10h)
 *   E. Operativo medio día (Amelia, 4h tentativo)
 *   F. Regla transversal: checada incompleta = $100 fijo (todos)
 *
 * Idempotente: cleanup inicial + final. No cobra ops (invoca executor directo).
 *
 * Uso: npx tsx _smoke/smoke-rrhh-4-grupos.ts
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
const FECHA_INI    = '2026-10-05';
const FECHA_FIN    = '2026-10-09';
const SMOKE_PATH   = `smoke-4grupos/${PORTAL_EMAIL}/biocheck-4g-${Date.now()}.xlsx`;

// Empleados ficticios con reloj_ids altos para no colisionar con reales.
const EMP_ADMIN     = { reloj_id: 'SMK-A', nombre: 'SMOKE ADMIN',       sueldo_diario: 500, hora_entrada: '08:00' };
const EMP_OMAR      = { reloj_id: 'SMK-O', nombre: 'SMOKE OMAR',        sueldo_diario: 733, hora_entrada: '09:00' };
const EMP_OPER_12H  = { reloj_id: 'SMK-C', nombre: 'SMOKE OPERATIVO12', sueldo_diario: 250, turno_horas_requeridas: 12, monto_retardo_base: 50, monto_retardo_doble: 100, ventana_entrada_desde: '08:00', ventana_entrada_hasta: '09:00' };
const EMP_ALBERTO   = { reloj_id: 'SMK-B', nombre: 'SMOKE ALBERTO',     sueldo_diario: 267, turno_horas_requeridas: 10, monto_retardo_base: 50, monto_retardo_doble: 100 };
const EMP_AMELIA    = { reloj_id: 'SMK-M', nombre: 'SMOKE AMELIA',      sueldo_diario: 133, turno_horas_requeridas: 4,  monto_retardo_base: 50, monto_retardo_doble: 100 };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('[smoke-4g] FAIL:', msg); process.exit(1); }
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

  // ─── ADMIN (SMK-A, hora 8:00, umbrales 30/90, $200/$400) ─────────────────
  // Lun 05: 07:55 (ok) + 17:00 (salida)
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-05', '07:55')]);
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-05', '17:00')]);
  // Mar 06: 08:15 (retardo_base) + 17:00
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-06', '08:15')]);
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-06', '17:00')]);
  // Mié 07: 08:45 (retardo_doble) + 17:00
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-07', '08:45')]);
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-07', '17:00')]);
  // Jue 08: solo entrada (checada incompleta → $100 override)
  ws.addRow([EMP_ADMIN.reloj_id, EMP_ADMIN.nombre, at('2026-10-08', '07:55')]);
  // Vie 09: sin checadas → falta ($500 sueldo)

  // ─── OMAR (SMK-O, hora 9:00, mismos umbrales que admin, usa fallback global $200/$400) ─
  // Lun 05: 08:55 (ok) + 18:00
  ws.addRow([EMP_OMAR.reloj_id, EMP_OMAR.nombre, at('2026-10-05', '08:55')]);
  ws.addRow([EMP_OMAR.reloj_id, EMP_OMAR.nombre, at('2026-10-05', '18:00')]);
  // Mar 06: 09:20 (retardo_base $200) + 18:00
  ws.addRow([EMP_OMAR.reloj_id, EMP_OMAR.nombre, at('2026-10-06', '09:20')]);
  ws.addRow([EMP_OMAR.reloj_id, EMP_OMAR.nombre, at('2026-10-06', '18:00')]);

  // ─── OPERATIVO 12H (SMK-C, turno 12h, $50/$100 por minutos faltantes) ────
  // Lun 05: 08:00 → 20:00 (12h exactas → ok)
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-05', '08:00')]);
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-05', '20:00')]);
  // Mar 06: 08:10 → 20:00 (11h50, faltan 10 → retardo_base $50)
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-06', '08:10')]);
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-06', '20:00')]);
  // Mié 07: 09:30 → 20:30 (11h, faltan 60 → retardo_doble $100, ejemplo oficial Lucero)
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-07', '09:30')]);
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-07', '20:30')]);
  // Jue 08: 10:00 → 20:00 (10h, faltan 120 → falta $250 sueldo)
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-08', '10:00')]);
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-08', '20:00')]);
  // Vie 09: solo salida (checada incompleta → $100 override)
  ws.addRow([EMP_OPER_12H.reloj_id, EMP_OPER_12H.nombre, at('2026-10-09', '20:00')]);

  // ─── ALBERTO (SMK-B, turno 10h, $50/$100) ────────────────────────────────
  // Lun 05: 08:00 → 18:00 (10h → ok)
  ws.addRow([EMP_ALBERTO.reloj_id, EMP_ALBERTO.nombre, at('2026-10-05', '08:00')]);
  ws.addRow([EMP_ALBERTO.reloj_id, EMP_ALBERTO.nombre, at('2026-10-05', '18:00')]);
  // Mar 06: 09:00 → 18:00 (9h, faltan 60 → retardo_doble $100)
  ws.addRow([EMP_ALBERTO.reloj_id, EMP_ALBERTO.nombre, at('2026-10-06', '09:00')]);
  ws.addRow([EMP_ALBERTO.reloj_id, EMP_ALBERTO.nombre, at('2026-10-06', '18:00')]);

  // ─── AMELIA (SMK-M, turno 4h, $50/$100) ──────────────────────────────────
  // Lun 05: 08:00 → 12:30 (4h30 → ok, cubre)
  ws.addRow([EMP_AMELIA.reloj_id, EMP_AMELIA.nombre, at('2026-10-05', '08:00')]);
  ws.addRow([EMP_AMELIA.reloj_id, EMP_AMELIA.nombre, at('2026-10-05', '12:30')]);
  // Mar 06: 08:00 → 11:50 (3h50, faltan 10 → retardo_base $50)
  ws.addRow([EMP_AMELIA.reloj_id, EMP_AMELIA.nombre, at('2026-10-06', '08:00')]);
  ws.addRow([EMP_AMELIA.reloj_id, EMP_AMELIA.nombre, at('2026-10-06', '11:50')]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

interface DayExpected {
  fecha:          string;
  classification: string;
  monto:          number;
}
interface EmpExpected {
  reloj_id: string;
  nombre:   string;
  totalMonto: number;
  dias:     DayExpected[];
}

const EXPECTED: EmpExpected[] = [
  {
    reloj_id: 'SMK-A', nombre: 'SMOKE ADMIN',
    totalMonto: 0 + 200 + 400 + 100 + 500,   // ok + base + doble + incompleta + falta
    dias: [
      { fecha: '2026-10-05', classification: 'ok',                  monto: 0 },
      { fecha: '2026-10-06', classification: 'retardo_base',        monto: 200 },
      { fecha: '2026-10-07', classification: 'retardo_doble',       monto: 400 },
      { fecha: '2026-10-08', classification: 'checada_incompleta',  monto: 100 },
      { fecha: '2026-10-09', classification: 'falta',               monto: 500 },
    ],
  },
  {
    reloj_id: 'SMK-O', nombre: 'SMOKE OMAR',
    totalMonto: 0 + 200 + 733 + 733 + 733,   // falta = sueldo diario per-empleado (733), no global ($500)
    dias: [
      { fecha: '2026-10-05', classification: 'ok',           monto: 0 },
      { fecha: '2026-10-06', classification: 'retardo_base', monto: 200 },
      { fecha: '2026-10-07', classification: 'falta',        monto: 733 },
      { fecha: '2026-10-08', classification: 'falta',        monto: 733 },
      { fecha: '2026-10-09', classification: 'falta',        monto: 733 },
    ],
  },
  {
    reloj_id: 'SMK-C', nombre: 'SMOKE OPERATIVO12',
    totalMonto: 0 + 50 + 100 + 250 + 100,
    dias: [
      { fecha: '2026-10-05', classification: 'ok',                 monto: 0 },
      { fecha: '2026-10-06', classification: 'retardo_base',       monto: 50 },
      { fecha: '2026-10-07', classification: 'retardo_doble',      monto: 100 },
      { fecha: '2026-10-08', classification: 'falta',              monto: 250 },
      { fecha: '2026-10-09', classification: 'checada_incompleta', monto: 100 },
    ],
  },
  {
    reloj_id: 'SMK-B', nombre: 'SMOKE ALBERTO',
    totalMonto: 0 + 100 + 267 + 267 + 267,
    dias: [
      { fecha: '2026-10-05', classification: 'ok',             monto: 0 },
      { fecha: '2026-10-06', classification: 'retardo_doble',  monto: 100 },
      { fecha: '2026-10-07', classification: 'falta',          monto: 267 },
      { fecha: '2026-10-08', classification: 'falta',          monto: 267 },
      { fecha: '2026-10-09', classification: 'falta',          monto: 267 },
    ],
  },
  {
    reloj_id: 'SMK-M', nombre: 'SMOKE AMELIA',
    totalMonto: 0 + 50 + 133 + 133 + 133,
    dias: [
      { fecha: '2026-10-05', classification: 'ok',             monto: 0 },
      { fecha: '2026-10-06', classification: 'retardo_base',   monto: 50 },
      { fecha: '2026-10-07', classification: 'falta',          monto: 133 },
      { fecha: '2026-10-08', classification: 'falta',          monto: 133 },
      { fecha: '2026-10-09', classification: 'falta',          monto: 133 },
    ],
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta env'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const ctx = {
    agentId: 'smoke-4g', portalEmail: PORTAL_EMAIL, agentName: 'Smoke', businessName: 'AC',
    portalToken: '', agent: {}, supabase,
  } as unknown as AgentToolContext;

  console.log('[smoke-4g] ─── Set monto_checada_incompleta_default=100 (fallback global) ──');
  await supabase.from('rrhh_nomina_config').update({ monto_checada_incompleta_default: 100 }).eq('portal_email', PORTAL_EMAIL);

  console.log('[smoke-4g] ─── Cleanup previo ──────────────────────────');
  const smokeIds = [EMP_ADMIN.reloj_id, EMP_OMAR.reloj_id, EMP_OPER_12H.reloj_id, EMP_ALBERTO.reloj_id, EMP_AMELIA.reloj_id];
  await supabase.from('rrhh_empleados').delete().eq('portal_email', PORTAL_EMAIL).in('reloj_id', smokeIds);

  console.log('[smoke-4g] ─── Alta de 5 empleados ficticios ─────────');
  for (const emp of [EMP_ADMIN, EMP_OMAR, EMP_OPER_12H, EMP_ALBERTO, EMP_AMELIA]) {
    const r = await executeRrhhTool('rrhh_registrar_empleado', emp, ctx) as { ok: boolean; message?: string; error?: string };
    assert(r.ok, `alta ${(emp as { nombre: string }).nombre} falló: ${r.error}`);
    console.log(`   ${r.message}`);
  }

  console.log('\n[smoke-4g] ─── Upload Excel sintético ────────────────');
  const buf = await buildExcel();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(SMOKE_PATH, buf, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true });
  assert(!upErr, `upload: ${upErr?.message}`);
  console.log(`   uploaded: ${BUCKET}/${SMOKE_PATH}`);

  console.log('\n[smoke-4g] ─── Procesar quincena ──────────────────────');
  const procRes = await executeRrhhTool('rrhh_procesar_quincena_desde_excel', {
    excel_url: `${BUCKET}/${SMOKE_PATH}`, fecha_inicio: FECHA_INI, fecha_fin: FECHA_FIN,
  }, ctx) as { ok: boolean; message?: string; download_url?: string; resumen?: { totalEmpleados: number; totalChecadas: number; totalRetardos: number; totalFaltas: number; totalMontoCalculado: number | null; pendienteDeMontos: boolean; warnings: string[] } };
  assert(procRes.ok, `procesar: ${procRes.message}`);
  assert(procRes.resumen, 'sin resumen');
  console.log(`   ${procRes.message}`);

  console.log('\n[smoke-4g] ─── Descargar Excel + verificar por fila ──');
  assert(procRes.download_url, 'sin download_url');
  const res = await fetch(procRes.download_url);
  assert(res.ok, `download HTTP ${res.status}`);
  const outBuf = Buffer.from(await res.arrayBuffer());
  const wbOut = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wbOut.xlsx.load(outBuf as any);
  const detalle = wbOut.getWorksheet('Detalle diario');
  assert(detalle, 'hoja Detalle diario missing');

  // Index by (relojId, fecha).
  const CLS_LABEL = {
    ok: 'Puntual', retardo_base: 'Retardo', retardo_doble: 'Retardo doble', falta: 'Falta',
    checada_incompleta: 'Checada incompleta', descanso: 'Descanso', vacaciones: 'Vacaciones', festivo: 'Festivo',
  } as Record<string, string>;
  const byKey = new Map<string, { clasif: string; monto: unknown }>();
  detalle.eachRow((row, r) => {
    if (r === 1) return;
    const relojId = String(row.getCell(2).value ?? '');
    const fecha   = String(row.getCell(3).value ?? '');
    const clasif  = String(row.getCell(6).value ?? '');
    const monto   = row.getCell(8).value;
    byKey.set(`${relojId}|${fecha}`, { clasif, monto });
  });

  let failures = 0;
  for (const emp of EXPECTED) {
    console.log(`\n   ${emp.nombre} (${emp.reloj_id}): monto esperado total $${emp.totalMonto}`);
    let total = 0;
    for (const d of emp.dias) {
      const row = byKey.get(`${emp.reloj_id}|${d.fecha}`);
      if (!row) { console.error(`      ✗ ${d.fecha}: fila no encontrada`); failures++; continue; }
      const expLabel = CLS_LABEL[d.classification];
      const match = row.clasif === expLabel && Number(row.monto) === d.monto;
      total += Number(row.monto) || 0;
      console.log(`      ${match ? '✓' : '✗'} ${d.fecha}  esperado: ${expLabel} $${d.monto}  obtuve: ${row.clasif} $${row.monto}`);
      if (!match) failures++;
    }
    if (total !== emp.totalMonto) { console.error(`      ✗ TOTAL ${total} != esperado ${emp.totalMonto}`); failures++; }
  }

  console.log('\n[smoke-4g] ─── Cleanup final ──────────────────────────');
  await supabase.from('rrhh_empleados').delete().eq('portal_email', PORTAL_EMAIL).in('reloj_id', smokeIds);
  await supabase.storage.from(BUCKET).remove([SMOKE_PATH]);

  if (failures) { console.error(`\n[smoke-4g] ✗ ${failures} assertion(s) fallaron.`); process.exit(1); }
  console.log('\n[smoke-4g] ✓ TODO PASÓ. Fase 2a.2 (4 grupos + checada incompleta) verde contra prod.');
}

main().catch(err => { console.error('[smoke-4g] ERROR:', err); process.exit(1); });
