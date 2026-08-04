/**
 * Crea org + agente Nia para el piloto Municipio de Monterrey.
 * Idempotente: si ya existe, no duplica.
 *
 * Uso: npx tsx scripts/tramites/_create_mty_org_and_agent.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PORTAL_EMAIL = 'ayuda.utiles@monterrey.gob.mx';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Paso 1: verificar estado actual
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('portal_email, name, plan')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();

  const { data: existingAgents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name')
    .eq('portal_email', PORTAL_EMAIL);

  console.log('=== Estado actual ===');
  console.log('  org:', existingOrg ?? 'NO EXISTE');
  console.log('  agents:', existingAgents?.length ?? 0);

  if (existingAgents && existingAgents.length > 0) {
    console.log('  → agentes existentes, no re-creo. Salgo.');
    return;
  }

  const agentInsert = {
    portal_email: PORTAL_EMAIL,
    client_name: 'Contacto Municipio MTY',
    business_name: 'Municipio de Monterrey',
    business_phone_display: '',
    phone_number: '',
    agent_name: 'Nia',
    role: 'Atención Ciudadana - Trámites Municipales',
    plan: 'pro',
    features: {
      skip_aup: true,
      lite_prompt: true,
      smart_transfer: false,
      use_custom_llm: true,
      meerkat_role_id: 'nia',
      lead_qualification: false,
      appointment_booking: false,
      skip_recording_notice: false,
    },
    minutes_included: 300,
    ai_ops_limit: 700,
    jornada_type: 'combinada',
    active: true,
    timezone: 'America/Monterrey',
    client_email: PORTAL_EMAIL,
  };

  console.log('\n=== Payload voice_agents ===');
  console.log(JSON.stringify(agentInsert, null, 2));

  if (DRY_RUN) {
    console.log('\n[DRY RUN] no ejecuto INSERT.');
    return;
  }

  console.log('\n=== Insertando voice_agent (el trigger creará org automáticamente) ===');
  const { data: newAgent, error: agentErr } = await supabase
    .from('voice_agents')
    .insert(agentInsert)
    .select('id, agent_name, portal_email, business_name')
    .single();

  if (agentErr) {
    console.error('ERROR insertando voice_agent:', agentErr);
    process.exit(1);
  }

  console.log('OK voice_agent:', newAgent);

  // Paso 2: actualizar campos de org que el trigger no llena
  console.log('\n=== Actualizando organizations con datos del municipio ===');
  const { data: updatedOrg, error: orgErr } = await supabase
    .from('organizations')
    .update({
      name: 'Municipio de Monterrey',
      legal_name: 'Municipio de Monterrey, Nuevo León',
      business_description: 'Gobierno Municipal de Monterrey - Programa de Útiles Escolares 2026 y trámites ciudadanos.',
    })
    .eq('portal_email', PORTAL_EMAIL)
    .select('portal_email, name, plan')
    .single();

  if (orgErr) {
    console.error('ERROR actualizando org (voice_agent ya creado):', orgErr);
    process.exit(1);
  }

  console.log('OK org:', updatedOrg);
  console.log('\n✅ Listo. Ahora corre el seed del trámite:');
  console.log(`   MTY_PORTAL_EMAIL='${PORTAL_EMAIL}' npx tsx scripts/tramites/seed-mty-utiles.ts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
