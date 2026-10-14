/**
 * Habilita el pack hr_nomina para AC Proyectos.
 *
 * Pre-reqs:
 * - Migración 20261013220000_rrhh_nomina_v1_schema.sql ya aplicada.
 * - .env.local con SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   npx tsx _smoke/seed-ac-rrhh-nomina-v1.ts --portal-email=<portal_email>
 *
 * Opciones:
 *   --dry-run                        Solo imprime lo que haría, sin escribir.
 *   --monto-retardo-base=NUMBER      Pesos para retardo 8:01-8:29 (null si no se pasa).
 *   --monto-retardo-doble=NUMBER     Pesos para retardo 8:30-9:29 (null si no se pasa).
 *   --monto-falta=NUMBER             Pesos para falta 9:30+ (null si no se pasa).
 *
 * Idempotente: UPSERT en nomina_config, jsonb merge para features y whitelist,
 * dedup en tool_overrides.enabled.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const RRHH_TOOL_NAMES = [
  'rrhh_registrar_empleado',
  'rrhh_dar_baja_empleado',
  'rrhh_registrar_descansos_mensuales',
  'rrhh_registrar_vacaciones_autorizadas',
  'rrhh_procesar_quincena_desde_excel',
];

const OPERADORA = 'lucero@porteoglobal.com';

function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function parseNum(name: string): number | null {
  const v = parseFlag(name);
  if (v === undefined) return null;
  const n = Number(v);
  if (!isFinite(n) || n < 0) throw new Error(`${name} inválido: ${v}`);
  return n;
}

async function main() {
  const portalEmail = parseFlag('portal-email');
  if (!portalEmail) {
    console.error('Falta --portal-email=<email>. Ej: --portal-email=hola@acproyectos.mx');
    process.exit(1);
  }
  const dryRun = hasFlag('dry-run');
  const montoRetBase  = parseNum('monto-retardo-base');
  const montoRetDoble = parseNum('monto-retardo-doble');
  const montoFalta    = parseNum('monto-falta');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`[seed] portal_email: ${portalEmail}`);
  console.log(`[seed] dry-run: ${dryRun}`);
  console.log(`[seed] montos: base=${montoRetBase} doble=${montoRetDoble} falta=${montoFalta}`);

  // 1. Verificar que la org existe.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('portal_email, features, rrhh_authorized_operators')
    .eq('portal_email', portalEmail)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) { console.error(`Org no encontrada: ${portalEmail}`); process.exit(1); }

  const currentFeatures = (org.features as Record<string, unknown> | null) ?? {};
  const currentOperators = Array.isArray(org.rrhh_authorized_operators) ? (org.rrhh_authorized_operators as string[]) : [];

  const nextFeatures  = { ...currentFeatures, rrhh_nomina_v1: true };
  const nextOperators = currentOperators.includes(OPERADORA) ? currentOperators : [...currentOperators, OPERADORA];

  console.log(`[seed] features actualizados: ${JSON.stringify(nextFeatures)}`);
  console.log(`[seed] whitelist operadoras: ${JSON.stringify(nextOperators)}`);

  // 2. Agentes Naia de la org.
  const { data: agents, error: agErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, features, tool_overrides')
    .eq('portal_email', portalEmail);
  if (agErr) throw agErr;
  const naiaAgents = (agents ?? []).filter(a => {
    const f = a.features as Record<string, unknown> | null;
    return f?.meerkat_role_id === 'naia';
  });
  if (!naiaAgents.length) {
    console.warn(`[seed] WARNING: no hay voice_agents con meerkat_role_id=naia para ${portalEmail}. El pack queda activo pero sin agente consumidor.`);
  } else {
    for (const a of naiaAgents) {
      const curOverrides = (a.tool_overrides as { disabled?: string[]; enabled?: string[] } | null) ?? { disabled: [], enabled: [] };
      const curEnabled = Array.isArray(curOverrides.enabled) ? curOverrides.enabled : [];
      const nextEnabled = Array.from(new Set([...curEnabled, ...RRHH_TOOL_NAMES]));
      const nextOverrides = { disabled: curOverrides.disabled ?? [], enabled: nextEnabled };
      console.log(`[seed] agente ${a.id} (${a.agent_name}) tool_overrides.enabled: ${JSON.stringify(nextEnabled)}`);
      if (!dryRun) {
        const { error } = await supabase.from('voice_agents').update({ tool_overrides: nextOverrides }).eq('id', a.id);
        if (error) throw error;
      }
    }
  }

  // 3. Config inicial de nómina (upsert).
  const nominaConfig: Record<string, unknown> = {
    portal_email:              portalEmail,
    hora_entrada_default:      '08:00',
    umbral_retardo_doble_min:  30,
    umbral_falta_min:          90,
    monto_retardo_base:        montoRetBase,
    monto_retardo_doble:       montoRetDoble,
    monto_falta:               montoFalta,
    dias_corte_quincena_antes: 1,
    activo:                    true,
  };
  console.log(`[seed] rrhh_nomina_config: ${JSON.stringify(nominaConfig)}`);

  if (dryRun) {
    console.log('\n[dry-run] Ningún cambio escrito. Vuelve a correr sin --dry-run para aplicar.');
    return;
  }

  const { error: orgUpd } = await supabase.from('organizations')
    .update({ features: nextFeatures, rrhh_authorized_operators: nextOperators })
    .eq('portal_email', portalEmail);
  if (orgUpd) throw orgUpd;

  const { error: cfgErr } = await supabase.from('rrhh_nomina_config')
    .upsert(nominaConfig, { onConflict: 'portal_email' });
  if (cfgErr) throw cfgErr;

  console.log('\n[seed] OK. AC Proyectos tiene el pack hr_nomina activo.');
  if (montoRetBase === null || montoRetDoble === null || montoFalta === null) {
    console.log('[seed] Nota: algún monto quedó NULL. La tool rrhh_procesar_quincena_desde_excel devolverá clasificación sin cálculo monetario hasta que configures los montos.');
    console.log('[seed] Para configurar después:');
    console.log(`  UPDATE rrhh_nomina_config SET monto_retardo_base=X, monto_retardo_doble=Y, monto_falta=Z WHERE portal_email='${portalEmail}';`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
