/**
 * Bulk upsert de los 7 empleados operativos de AC Proyectos con sus reglas
 * de excepción ($50 retardo base / $100 doble, patrón "turno 12 horas").
 *
 * Fuente: Excel "EXCEPCIONES RELOJ CHECADOR.xlsx" compartido por Lucero
 * 2026-10-15. Reloj_ids identificados: 120, 215, 144, 158, 186, 187, 217.
 *
 * Supuestos default (confirmar con Lucero antes de calcular quincena real):
 *  - hora_entrada 8:00 AM (igual que admin, confirmado por patrón de checadas).
 *  - umbrales 30 min retardo doble + 90 min falta (iguales que admin).
 *  - Sueldo diario: NULL hasta que Lucero lo pase (igual que admin).
 *
 * Idempotente: UPSERT por (portal_email, reloj_id). Si ya existen con otros
 * valores, los sobreescribe.
 *
 * Uso: npx tsx _smoke/seed-ac-operativos-exceptions.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const PORTAL_EMAIL = 'camila@acproyectos.com';
const ACTOR        = 'seed-ac-operativos-exceptions';

// Nombres oficiales + sueldos mensuales confirmados por Lucero 2026-10-16 vía
// EMPLEADOS-SUELDOS.xlsx. Sueldo diario = mensual / 30 (patrón que ella usa).
const OPERATIVOS = [
  { reloj_id: '120', nombre: 'ALBERTO ARQUIETA GONZALEZ',         sueldo_mensual: 8000 },
  { reloj_id: '215', nombre: 'SHERLYN ALEXANDRA ALVAREZ BALBOA',  sueldo_mensual: 6500 },
  { reloj_id: '144', nombre: 'LUIS MARTIN AVILA SANDOVAL',        sueldo_mensual: 7500 },
  { reloj_id: '158', nombre: 'RIGOBERTO GARCIA VERA',             sueldo_mensual: 7500 },
  { reloj_id: '186', nombre: 'JOSE ALFREDO CRUZ HERNANDEZ',       sueldo_mensual: 7500 },
  { reloj_id: '187', nombre: 'HECTOR ELI AVILA SANDOVAL',         sueldo_mensual: 7500 },
  { reloj_id: '217', nombre: 'JAN CARLO HERNANDEZ GARCIA',        sueldo_mensual: 6500 },
];

const MONTO_RETARDO_BASE_OPERATIVO  = 50;
const MONTO_RETARDO_DOBLE_OPERATIVO = 100;

function diarioFromMensual(mensual: number): number {
  // Lucero divide /30 (confirmado por su cálculo de Omar: 733.33 * 15 = ~11000 quincena).
  return Math.round((mensual / 30) * 100) / 100;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta env'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`[seed-ops] Upserting ${OPERATIVOS.length} operativos para ${PORTAL_EMAIL}...`);

  const payloads = OPERATIVOS.map(e => ({
    portal_email:              PORTAL_EMAIL,
    reloj_id:                  e.reloj_id,
    nombre:                    e.nombre,
    hora_entrada:              '08:00',
    sueldo_diario_mxn:         diarioFromMensual(e.sueldo_mensual),
    monto_retardo_base_mxn:    MONTO_RETARDO_BASE_OPERATIVO,
    monto_retardo_doble_mxn:   MONTO_RETARDO_DOBLE_OPERATIVO,
    activo:                    true,
    registrado_por:            ACTOR,
    nota:                      `Operativo turno 12h (excepción). Mensual $${e.sueldo_mensual}, diario /30. Umbrales base/doble = minutos faltantes del turno (lógica Fase 2a.2 pendiente).`,
  }));

  const { data, error } = await supabase.from('rrhh_empleados')
    .upsert(payloads, { onConflict: 'portal_email,reloj_id' })
    .select('reloj_id, nombre, hora_entrada, monto_retardo_base_mxn, monto_retardo_doble_mxn, sueldo_diario_mxn');

  if (error) { console.error('[seed-ops] UPSERT falló:', error.message); process.exit(1); }

  console.log('[seed-ops] OK. Estado final:');
  for (const row of (data ?? [])) {
    console.log(` - ${row.reloj_id}  ${(row.nombre as string).padEnd(36)}  hora:${row.hora_entrada}  base:$${row.monto_retardo_base_mxn}  doble:$${row.monto_retardo_doble_mxn}  sueldo:$${row.sueldo_diario_mxn}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
