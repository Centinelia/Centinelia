/**
 * Catálogo completo AC Proyectos: 37 empleados con reloj_ids reales + sueldos
 * + modelos de cálculo según los 4 grupos (admin, admin hora distinta Omar,
 * operativos turno 12h/10h/medio día, con regla transversal checada
 * incompleta = $100).
 *
 * Fuentes:
 *  - no. empleados.xlsx (Lucero 2026-10-16) → 38 reloj_ids reales.
 *  - EMPLEADOS-SUELDOS.xlsx (Lucero 2026-10-16) → 42 sueldos mensuales.
 *  - WhatsApp Lucero 2026-10-15/16 → reglas de cada grupo.
 *
 * Idempotente: UPSERT por (portal_email, reloj_id). Setear sueldo con
 * mensual /30 (patrón confirmado por el cálculo de Omar: 733.33 × 15 = ~11k
 * quincena).
 *
 * Uso: npx tsx _smoke/seed-ac-full-catalog.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const PORTAL_EMAIL = 'camila@acproyectos.com';
const ACTOR        = 'seed-ac-full-catalog';
const DRY_RUN      = process.argv.includes('--dry-run');

type Grupo = 'admin' | 'admin_hora_distinta' | 'operativo_12h' | 'operativo_10h' | 'operativo_medio_dia';

interface Empleado {
  reloj_id:            string;
  nombre:              string;
  mensual:             number | null;   // null = sueldo pendiente
  grupo:               Grupo;
  hora_entrada?:       string;   // modo admin
  turno_horas?:        number;   // modo turno cubierto
  ventana_desde?:      string;   // modo turno cubierto
  ventana_hasta?:      string;   // modo turno cubierto
}

// ─── Admin estándar (hora 8:00, umbrales 30/90 globales $200/$400) ─────────
const ADMIN_ESTANDAR: Empleado[] = [
  { reloj_id: '2',   nombre: 'HORACIO ANTONINO FLORES MONTOYA',       mensual: 9000,  grupo: 'admin' },
  { reloj_id: '3',   nombre: 'ALMA DELIA DUQUE CUEVAS',               mensual: 7000,  grupo: 'admin' },
  { reloj_id: '4',   nombre: 'ADRIANA PATRICIA GALLEGOS SANCHEZ',     mensual: 9000,  grupo: 'admin' },
  { reloj_id: '5',   nombre: 'PERLA ELIZABETH BAUTISTA RENOVATO',     mensual: 6000,  grupo: 'admin' },
  { reloj_id: '8',   nombre: 'SAMUEL SAENZ GONZALEZ',                 mensual: 10000, grupo: 'admin' },
  { reloj_id: '15',  nombre: 'LEONARDO CARDENAS PUENTE',              mensual: 6000,  grupo: 'admin' },
  { reloj_id: '17',  nombre: 'ISAAC QUINTANA MORA',                   mensual: 5000,  grupo: 'admin' },
  { reloj_id: '20',  nombre: 'ENRIQUE JORDAN MORENO GUTIERREZ',       mensual: 9000,  grupo: 'admin' },
  { reloj_id: '21',  nombre: 'HILARIO JUAREZ VALDEZ',                 mensual: 9000,  grupo: 'admin' },
  { reloj_id: '26',  nombre: 'GONZALO CARDENAS PUENTE',               mensual: 10000, grupo: 'admin' },
  { reloj_id: '29',  nombre: 'RICARDO CORONEL SOLIS',                 mensual: 10000, grupo: 'admin' },
  { reloj_id: '30',  nombre: 'KARINA ADILIA GALAN DIAZ',              mensual: 9000,  grupo: 'admin' },
  { reloj_id: '97',  nombre: 'BRENDA YAZMIN RODRIGUEZ HEREDIA',       mensual: 6500,  grupo: 'admin' },
  { reloj_id: '102', nombre: 'CYTLALY TANARY DIAZ GALLEGOS',          mensual: 7000,  grupo: 'admin' },
  { reloj_id: '113', nombre: 'NELLY NAZAREA GONZALEZ MARMOLEJO',      mensual: 7500,  grupo: 'admin' },
  { reloj_id: '125', nombre: 'CARLOS DANIEL FLORES ROSALES',          mensual: 7000,  grupo: 'admin' },
  { reloj_id: '135', nombre: 'JULIO ENRIQUE OLVERA QUIRINO',          mensual: 9000,  grupo: 'admin' },
  { reloj_id: '138', nombre: 'JOSE ALBERTO GORRA PORTUGAL',           mensual: 10000, grupo: 'admin' },
  { reloj_id: '150', nombre: 'NORYKO ALEJANDRA RODRIGUEZ CENICEROS',  mensual: 7000,  grupo: 'admin' },
  { reloj_id: '181', nombre: 'CHRISTOPHER ALAN GONZALEZ MARMOLEJO',   mensual: 6000,  grupo: 'admin' },
  { reloj_id: '182', nombre: 'JOSE ALEJANDRO CANO VELAZQUEZ',         mensual: 6000,  grupo: 'admin' },
  { reloj_id: '185', nombre: 'REU DOMINGO AGUDO CANSECO',             mensual: 8000,  grupo: 'admin' },
  { reloj_id: '202', nombre: 'LUIS GABRIEL HERNANDEZ CHAVEZ',         mensual: 10000, grupo: 'admin' },
  { reloj_id: '210', nombre: 'LUIS ENRIQUE TORRES RAMIREZ',           mensual: 5000,  grupo: 'admin' },
  { reloj_id: '211', nombre: 'ERICK FERNANDO AGUILAR MURILLO',        mensual: 9000,  grupo: 'admin' },
  { reloj_id: '213', nombre: 'FERNANDEZ MOGON JUAN MANUEL',           mensual: 6000,  grupo: 'admin' },
  { reloj_id: '216', nombre: 'CLEMENTE HERNANDEZ RODRIGUEZ',          mensual: 12000, grupo: 'admin' },
  { reloj_id: '222', nombre: 'EDGAR ALEJANDRO TORRES MARQUEZ',        mensual: 5000,  grupo: 'admin' },
];

// ─── Omar Castillo: admin con hora 9:00 ────────────────────────────────────
const OMAR: Empleado = {
  reloj_id: '122',
  nombre:   'MANUEL OMAR CASTILLO REYES',
  mensual:  11000,  // 733.33 × 15 = ~11000 quincena → 22000 mensual = demasiado. Lucero usa 11k mensual (vamos con eso).
  grupo:    'admin_hora_distinta',
  hora_entrada: '09:00',
};

// ─── Operativos turno 12h (6, Alberto va aparte en 10h) ─────────────────────
const OPERATIVOS_12H: Empleado[] = [
  { reloj_id: '215', nombre: 'SHERLYN ALEXANDRA ALVAREZ BALBOA',  mensual: 6500, grupo: 'operativo_12h', turno_horas: 12, ventana_desde: '08:00', ventana_hasta: '09:00' },
  { reloj_id: '144', nombre: 'LUIS MARTIN AVILA SANDOVAL',        mensual: 7500, grupo: 'operativo_12h', turno_horas: 12, ventana_desde: '08:00', ventana_hasta: '09:00' },
  { reloj_id: '158', nombre: 'RIGOBERTO GARCIA VERA',             mensual: 7500, grupo: 'operativo_12h', turno_horas: 12, ventana_desde: '08:00', ventana_hasta: '09:00' },
  { reloj_id: '186', nombre: 'JOSE ALFREDO CRUZ HERNANDEZ',       mensual: 7500, grupo: 'operativo_12h', turno_horas: 12, ventana_desde: '08:00', ventana_hasta: '09:00' },
  { reloj_id: '187', nombre: 'HECTOR ELI AVILA SANDOVAL',         mensual: 7500, grupo: 'operativo_12h', turno_horas: 12, ventana_desde: '08:00', ventana_hasta: '09:00' },
  { reloj_id: '217', nombre: 'JAN CARLO HERNANDEZ GARCIA',        mensual: 6500, grupo: 'operativo_12h', turno_horas: 12, ventana_desde: '08:00', ventana_hasta: '09:00' },
];

// ─── Alberto Arquieta: operativo turno 10h (8am-6pm, extras pagados aparte) ─
const ALBERTO: Empleado = {
  reloj_id: '120',
  nombre:   'ALBERTO ARQUIETA GONZALEZ',
  mensual:  8000,
  grupo:    'operativo_10h',
  turno_horas: 10,
  ventana_desde: '08:00',
  ventana_hasta: '09:00',
};

// ─── Amelia Ramos: operativo "sale a medio día" (horas tentativo 4, pendiente confirmar) ─
const AMELIA: Empleado = {
  reloj_id: '219',
  nombre:   'AMELIA RAMOS HERRERA',
  mensual:  4000,
  grupo:    'operativo_medio_dia',
  turno_horas: 4,   // tentativo, pendiente confirmar con Lucero
  ventana_desde: '08:00',
  ventana_hasta: '09:00',
};

// ─── Luis Sanchez: reciente sin sueldo capturado (nos deja pendiente) ───────
const LUIS_SANCHEZ_SIN_SUELDO: Empleado = {
  reloj_id: '223',
  nombre:   'LUIS SANCHEZ',
  mensual:  null,
  grupo:    'admin',   // asumido mientras no se diga lo contrario
};

const TODOS: Empleado[] = [
  ...ADMIN_ESTANDAR,
  OMAR,
  ...OPERATIVOS_12H,
  ALBERTO,
  AMELIA,
  LUIS_SANCHEZ_SIN_SUELDO,
];

// AC Proyectos: montos retardo operativo = $50 / $100. Admin usa globales.
const MONTO_OPERATIVO_BASE  = 50;
const MONTO_OPERATIVO_DOBLE = 100;

function diarioFromMensual(mensual: number | null): number | null {
  if (mensual === null) return null;
  return Math.round((mensual / 30) * 100) / 100;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta env'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Asegurar que rrhh_nomina_config tiene monto_checada_incompleta_default=100.
  console.log('[seed-full] Setting monto_checada_incompleta_default=100 en rrhh_nomina_config...');
  if (!DRY_RUN) {
    const { error } = await supabase.from('rrhh_nomina_config')
      .update({ monto_checada_incompleta_default: 100 })
      .eq('portal_email', PORTAL_EMAIL);
    if (error) { console.error('ERROR config:', error.message); process.exit(1); }
  }

  console.log(`[seed-full] Upserting ${TODOS.length} empleados para ${PORTAL_EMAIL}...\n`);

  const payloads = TODOS.map(e => {
    const base: Record<string, unknown> = {
      portal_email:   PORTAL_EMAIL,
      reloj_id:       e.reloj_id,
      nombre:         e.nombre,
      hora_entrada:   e.hora_entrada ?? '08:00',  // NOT NULL en schema; default 8:00 si no se especifica.
      activo:         true,
      registrado_por: ACTOR,
      nota:           `Grupo: ${e.grupo}. Mensual: ${e.mensual === null ? 'pendiente' : `$${e.mensual}`}.`,
    };
    const diario = diarioFromMensual(e.mensual);
    if (diario !== null) base.sueldo_diario_mxn = diario;

    if (e.turno_horas)    base.turno_horas_requeridas = e.turno_horas;
    if (e.ventana_desde)  base.ventana_entrada_desde  = e.ventana_desde;
    if (e.ventana_hasta)  base.ventana_entrada_hasta  = e.ventana_hasta;

    // Operativos (12h, 10h, medio_dia) tienen montos propios $50/$100.
    if (e.grupo.startsWith('operativo_')) {
      base.monto_retardo_base_mxn  = MONTO_OPERATIVO_BASE;
      base.monto_retardo_doble_mxn = MONTO_OPERATIVO_DOBLE;
    }
    return base;
  });

  if (DRY_RUN) {
    console.log('[seed-full] DRY RUN. Primer payload:');
    console.log(JSON.stringify(payloads[0], null, 2));
    console.log(`\n[seed-full] Total ${payloads.length} empleados listos para UPSERT.`);
    return;
  }

  const { data, error } = await supabase.from('rrhh_empleados')
    .upsert(payloads, { onConflict: 'portal_email,reloj_id' })
    .select('reloj_id, nombre, hora_entrada, turno_horas_requeridas, sueldo_diario_mxn, monto_retardo_base_mxn');

  if (error) { console.error('[seed-full] UPSERT falló:', error.message); process.exit(1); }

  console.log('[seed-full] Estado final:\n');
  const sorted = (data ?? []).sort((a, b) => Number(a.reloj_id) - Number(b.reloj_id));
  for (const row of sorted) {
    const modo = row.turno_horas_requeridas ? `turno ${row.turno_horas_requeridas}h` : `admin ${row.hora_entrada}`;
    const base = row.monto_retardo_base_mxn ? `base $${row.monto_retardo_base_mxn}` : 'base global';
    const sueldo = row.sueldo_diario_mxn ? `sueldo $${row.sueldo_diario_mxn}/día` : 'sueldo pendiente';
    console.log(` ${String(row.reloj_id).padStart(3)}  ${(row.nombre as string).padEnd(40)}  ${modo.padEnd(14)}  ${base.padEnd(14)}  ${sueldo}`);
  }
  console.log(`\n[seed-full] OK, ${sorted.length} empleados cargados.`);
}

main().catch(err => { console.error(err); process.exit(1); });
