/**
 * Crea el voice_agent Naia (RRHH) para AC Proyectos. Chat/email-only (sin Vapi/phone).
 * Hereda columnas base del agente Nami de la misma org, y setea:
 *   - agent_name = 'Naia'
 *   - role       = 'Recursos Humanos'
 *   - features.meerkat_role_id = 'naia'
 *   - features.role_color      = '#ec4899' (color de Naia)
 *   - features.voice_enabled   = false
 *   - tool_overrides.enabled   = [5 tools rrhh_*] (gatadas por pack hr_nomina)
 *
 * Idempotente: si ya existe un agente con role=naia para esta org, aborta.
 *
 * Uso:
 *   npx tsx _smoke/create-naia-ac-proyectos.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });

const PORTAL_EMAIL = 'camila@acproyectos.com';

const RRHH_TOOLS = [
  'rrhh_registrar_empleado',
  'rrhh_dar_baja_empleado',
  'rrhh_registrar_descansos_mensuales',
  'rrhh_registrar_vacaciones_autorizadas',
  'rrhh_procesar_quincena_desde_excel',
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Idempotencia: ya existe Naia para esta org?
  const { data: existing } = await supabase
    .from('voice_agents')
    .select('id, agent_name, features')
    .eq('portal_email', PORTAL_EMAIL);
  const naiaExistente = (existing ?? []).find(a => (a.features as Record<string, unknown> | null)?.meerkat_role_id === 'naia');
  if (naiaExistente) {
    console.log(`[create-naia] Ya existe Naia para ${PORTAL_EMAIL}: id=${naiaExistente.id}, nombre=${naiaExistente.agent_name}`);
    console.log('[create-naia] Nada que hacer. Si quieres re-aplicar tool_overrides, corre el seed.');
    return;
  }

  // 2. Template: Nami de la misma org (ya existe, chat/email-only).
  const { data: template, error: tplErr } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL)
    .limit(1)
    .single();
  if (tplErr || !template) { console.error('No pude leer un agente template para AC:', tplErr?.message); process.exit(1); }

  // 3. Build Naia payload: copia del template + overrides.
  const t = template as Record<string, unknown>;
  const templateFeatures = (t.features as Record<string, unknown>) ?? {};

  const naiaFeatures = {
    ...templateFeatures,
    meerkat_role_id: 'naia',
    role_color:      '#ec4899',
    voice_enabled:   false,
    is_coordinator:  false,
    // Features del preset base de Naia (de meerkat-roles.ts):
    receptionist:            true,
    lead_qualification:      false,
    appointment_booking:     true,
    existing_client_support: true,
    smart_transfer:          true,
    order_taking:            false,
    multilingual:            false,
    client_memory:           false,
    outbound_calls:          false,
  };

  const naiaToolOverrides = {
    disabled: [],
    enabled:  RRHH_TOOLS,
  };

  // Omitir columnas que no se deben copiar: id, timestamps, portal_token (lo hereda la org, misma col),
  // vapi_* (null), phone_number (vacío), stripe_* (null), elevenlabs_voice_id (null).
  const SKIP = new Set([
    'id', 'created_at', 'updated_at',
    'vapi_agent_id', 'vapi_last_payload_hash', 'vapi_phone_number_id',
    'minutes_used', 'minutes_included', 'minutes_reset_date',
  ]);

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t)) {
    if (SKIP.has(k)) continue;
    payload[k] = v;
  }
  payload.agent_name     = 'Naia';
  payload.role           = 'Recursos Humanos';
  payload.features       = naiaFeatures;
  payload.tool_overrides = naiaToolOverrides;
  payload.client_name    = 'Lucero Longoria (operadora de nómina)';
  payload.client_email   = 'lucero@porteoglobal.com';
  payload.auto_reply     = false;

  console.log(`[create-naia] INSERT voice_agent Naia para ${PORTAL_EMAIL}...`);
  const { data: created, error: insErr } = await supabase
    .from('voice_agents')
    .insert(payload)
    .select('id, agent_name, portal_email, portal_token, features, tool_overrides')
    .single();
  if (insErr) { console.error('INSERT falló:', insErr.message); process.exit(1); }

  console.log('[create-naia] OK');
  console.log('  id:            ', created.id);
  console.log('  agent_name:    ', created.agent_name);
  console.log('  portal_email:  ', created.portal_email);
  console.log('  portal_token:  ', created.portal_token);
  console.log('  meerkat_role:  ', (created.features as { meerkat_role_id?: string } | null)?.meerkat_role_id);
  console.log('  tool_overrides:', JSON.stringify(created.tool_overrides));
  console.log('');
  console.log('[create-naia] Lucero puede chatear con Naia desde el portal usando el token de arriba.');
  console.log('[create-naia] Para email: falta configurar inbox IMAP/SMTP (siguiente paso, aparte).');
}

main().catch(err => { console.error(err); process.exit(1); });
