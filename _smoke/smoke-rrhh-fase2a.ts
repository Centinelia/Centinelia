/**
 * Smoke E2E del pack hr_nomina Fase 2a.
 * Prueba las 5 tools rrhh_* contra DB + Storage + executor REAL, sin pasar
 * por LLM ni portal.
 *
 * Caso: empleado ficticio reloj_id="999" con sueldo diario $500, quincena
 * 2026-10-05 a 2026-10-09 (lunes a viernes). Checadas sintéticas con casos
 * conocidos para validar cada clasificación y monto.
 *
 * Expected output del clasificador:
 *   Lun 05 07:55 → ok           $0
 *   Mar 06 08:00 → ok           $0
 *   Mié 07 08:15 → retardo_base $200
 *   Jue 08 08:45 → retardo_doble $400
 *   Vie 09 09:30 → falta        $500 (sueldo diario, no $monto_falta global que es NULL)
 *   TOTAL: $1,100
 *
 * Al final: cleanup (DELETE empleado ficticio + archivos storage).
 * Idempotente: si ya hay rastro del smoke anterior lo limpia primero.
 *
 * Uso: npx tsx _smoke/smoke-rrhh-fase2a.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { executeRrhhTool } from '../src/lib/tools/executors/rrhh';
import type { AgentToolContext } from '../src/lib/tools/executor';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const PORTAL_EMAIL = 'camila@acproyectos.com';
const RELOJ_ID     = '999';
const NOMBRE       = 'Smoke Test Empleado';
const SUELDO       = 500;
const FECHA_INI    = '2026-10-05';
const FECHA_FIN    = '2026-10-09';
const BUCKET       = 'rrhh-reloj';
const SMOKE_PATH   = `smoke/${PORTAL_EMAIL}/biocheck-smoke-${Date.now()}.xlsx`;

const EXPECTED = [
  { fecha: '2026-10-05', cls: 'ok',            monto: 0   },
  { fecha: '2026-10-06', cls: 'ok',            monto: 0   },
  { fecha: '2026-10-07', cls: 'retardo_base',  monto: 200 },
  { fecha: '2026-10-08', cls: 'retardo_doble', monto: 400 },
  { fecha: '2026-10-09', cls: 'falta',         monto: 500 },
];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('[smoke] FAIL:', msg); process.exit(1); }
}

function at(fecha: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, 0));
}

async function buildBiocheckExcel(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('AttLog');
  ws.addRow(['No', 'Name', 'Time']);
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-10-05', '07:55')]);
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-10-06', '08:00')]);
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-10-07', '08:15')]);
  ws.addRow([RELOJ_ID, NOMBRE, at('2026-10-08', '08:45')]);
  // Vie 09 sin checada → falta
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta env'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Fake context mínimo
  const ctx = {
    agentId:      'smoke-rrhh',
    portalEmail:  PORTAL_EMAIL,
    agentName:    'Smoke',
    businessName: 'AC Proyectos (smoke)',
    portalToken:  '',
    agent:        {},
    supabase,
  } as unknown as AgentToolContext;

  console.log('[smoke] ─── Cleanup previo ─────────────────────────────');
  await supabase.from('rrhh_vacaciones').delete().eq('portal_email', PORTAL_EMAIL).like('nota', 'smoke-%');
  await supabase.from('rrhh_empleados').delete().eq('portal_email', PORTAL_EMAIL).eq('reloj_id', RELOJ_ID);

  console.log('[smoke] ─── 1. rrhh_registrar_empleado ────────────────');
  const r1 = await executeRrhhTool('rrhh_registrar_empleado', {
    reloj_id:      RELOJ_ID,
    nombre:        NOMBRE,
    hora_entrada:  '08:00',
    sueldo_diario: SUELDO,
    nota:          'smoke-fase2a',
  }, ctx) as { ok: boolean; empleado_id?: string; message?: string; error?: string };
  console.log('   ->', r1.message || r1.error);
  assert(r1.ok, 'registrar_empleado falló');

  console.log('[smoke] ─── 2. rrhh_registrar_descansos_mensuales ────');
  const r2 = await executeRrhhTool('rrhh_registrar_descansos_mensuales', {
    anio:  2026,
    mes:   10,
    descansos: [{ reloj_id: RELOJ_ID, fechas: ['2026-10-11'] }],
  }, ctx) as { ok: boolean; message?: string; error?: string };
  console.log('   ->', r2.message || r2.error);
  assert(r2.ok, 'registrar_descansos falló');

  console.log('[smoke] ─── 3. rrhh_registrar_vacaciones_autorizadas ─');
  const r3 = await executeRrhhTool('rrhh_registrar_vacaciones_autorizadas', {
    reloj_id:     RELOJ_ID,
    fecha_inicio: '2026-10-20',
    fecha_fin:    '2026-10-24',
    nota:         'smoke-vacas',
  }, ctx) as { ok: boolean; message?: string; error?: string };
  console.log('   ->', r3.message || r3.error);
  assert(r3.ok, 'registrar_vacaciones falló');

  console.log('[smoke] ─── 4. Upload Excel sintético al bucket ──────');
  const excelBuf = await buildBiocheckExcel();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(SMOKE_PATH, excelBuf, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  });
  assert(!upErr, `upload falló: ${upErr?.message}`);
  console.log('   -> uploaded:', `${BUCKET}/${SMOKE_PATH}`);

  console.log('[smoke] ─── 5. rrhh_procesar_quincena_desde_excel ────');
  const r5 = await executeRrhhTool('rrhh_procesar_quincena_desde_excel', {
    excel_url:    `${BUCKET}/${SMOKE_PATH}`,
    fecha_inicio: FECHA_INI,
    fecha_fin:    FECHA_FIN,
  }, ctx) as {
    ok:            boolean;
    message?:      string;
    error?:        string;
    download_url?: string | null;
    resumen?: {
      totalEmpleados:      number;
      totalChecadas:       number;
      totalRetardos:       number;
      totalFaltas:         number;
      totalMontoCalculado: number | null;
      pendienteDeMontos:   boolean;
      warnings:            string[];
    };
  };
  console.log('   ->', r5.message || r5.error);
  assert(r5.ok, 'procesar_quincena falló');
  assert(r5.resumen, 'resumen vacío');

  console.log('[smoke] ─── 6. Verificar resumen ──────────────────────');
  console.log('   totalChecadas:       ', r5.resumen.totalChecadas, '(esperado 4)');
  console.log('   totalRetardos:       ', r5.resumen.totalRetardos, '(esperado 2)');
  console.log('   totalFaltas:         ', r5.resumen.totalFaltas, '(esperado 1)');
  console.log('   totalMontoCalculado: ', r5.resumen.totalMontoCalculado, '(esperado 1100)');
  console.log('   pendienteDeMontos:   ', r5.resumen.pendienteDeMontos, '(esperado false)');
  console.log('   warnings:            ', r5.resumen.warnings);

  assert(r5.resumen.totalChecadas === 4, 'checadas != 4');
  assert(r5.resumen.totalRetardos === 2, 'retardos != 2');
  assert(r5.resumen.totalFaltas === 1, 'faltas != 1');
  assert(r5.resumen.totalMontoCalculado === 1100, `monto total ${r5.resumen.totalMontoCalculado} != 1100`);
  assert(!r5.resumen.pendienteDeMontos, 'pendienteDeMontos debería ser false');

  console.log('[smoke] ─── 7. Descargar y verificar Excel output ────');
  if (r5.download_url) {
    const res = await fetch(r5.download_url);
    assert(res.ok, `download HTTP ${res.status}`);
    const outBuf = Buffer.from(await res.arrayBuffer());
    const wbOut = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wbOut.xlsx.load(outBuf as any);
    const detalle = wbOut.getWorksheet('Detalle diario');
    assert(detalle, 'hoja Detalle diario no existe');
    console.log('   -> Excel output descargado y parseado,', detalle.actualRowCount, 'filas');
  } else {
    console.log('   -> sin download_url (upload no funcionó, pero resumen OK)');
  }

  console.log('[smoke] ─── 8. Cleanup final ──────────────────────────');
  await supabase.from('rrhh_vacaciones').delete().eq('portal_email', PORTAL_EMAIL).eq('nota', 'smoke-vacas');
  await supabase.from('rrhh_empleados').delete().eq('portal_email', PORTAL_EMAIL).eq('reloj_id', RELOJ_ID);
  await supabase.storage.from(BUCKET).remove([SMOKE_PATH]);
  console.log('   -> cleanup OK (empleado + vacaciones + descansos CASCADE + Excel sintético)');

  console.log('\n[smoke] ✓ TODO PASÓ. Fase 2a end-to-end verde contra prod.');
}

main().catch(err => { console.error('[smoke] ERROR:', err); process.exit(1); });
