/**
 * Provisioning one-shot para AC Proyectos + Nami inventarios.
 *
 * Uso:
 *   node scripts/ac/provision-nami.mjs             # dry-run (default)
 *   node scripts/ac/provision-nami.mjs --apply     # inserta en Supabase real
 *
 * Modelo comercial (2026-09-30 con Nazre):
 * - AC paga 4 mensualidades de $20k + IVA por la implementación (marco financiero).
 * - Delivery real: probablemente Mes 1. Se activa Nami cuando esté lista.
 * - Al activar: cobro de incorporación + mensualidad Media Jornada (tareas-only).
 * - Nami: puras tareas, cero voz. Chat + correo.
 *
 * Estado inicial en DB:
 * - Org creada, contract aceptado (acuerdo verbal + WhatsApp).
 * - Nami creada con active=false, billing_status='pendiente'.
 * - Al activar: flip active=true, billing_status='activo', arrancar ai_ops_limit=500.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const MODE  = APPLY ? 'APPLY' : 'DRY-RUN';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PORTAL_EMAIL = 'camila@acproyectos.com';
const PORTAL_TOKEN = 'ac-nami-' + randomUUID().slice(0, 12);

// ───────────────────────────── payloads ─────────────────────────────
const orgPayload = {
  portal_email:            PORTAL_EMAIL,
  name:                    'AC Proyectos',
  legal_name:              'AIRE ACONDICIONADO PROYECTOS',
  rfc:                     'AAP010601S21',
  country:                 'MX',
  business_email:          PORTAL_EMAIL,
  business_address:        'Av. Pablo Gonzalez 702, Chepevera, Monterrey, NL 64030',
  industry:                'HVAC',
  portal_token:            PORTAL_TOKEN,
  plan:                    'pro',            // NOT NULL. Real gating vive en voice_agents.active/billing_status
  account_status:          'active',
  aup_accepted_at:         new Date().toISOString(),
  contract_accepted_at:    new Date().toISOString(),
  contract_signer_name:    'Camila (contacto operativo AC Proyectos)',
  inventory_excel_config: {
    onedrive_share_url:
      'https://acproyectoshvac-my.sharepoint.com/:x:/g/personal/camila_acproyectos_com/IQCp9u37-ZskS4-bHxIjL_tbAQSyYWH_c4rHaBsjUMjd6o8?e=Mmygle',
    connected_account:     'camila@acproyectos.com',
    legacy_readonly_url:   null,              // pendiente compartir INVENTARIO 2026 1.xlsx solo-lectura
    reposicion_recipients: ['camila@acproyectos.com'],
    backlog_trane: {
      recipient_at_ac:     'victoria@acproyectos.com',
      original_sender:     'no-reply@tranetechnologies.com',
      pdf_password:        '595170',
      routing_status:      'pending_forward_setup',
    },
  },
};

const namiPayload = {
  portal_email:           PORTAL_EMAIL,
  agent_name:             'Nami',
  business_name:          'AC Proyectos',
  client_name:            'Camila',
  client_email:           PORTAL_EMAIL,
  role:                   'Inventarios',
  active:                 false,             // activar cuando Nami esté lista
  billing_status:         'pendiente',       // pool arranca al activar
  plan:                   'pro',
  jornada_type:           'tareas',          // puras tareas, cero voz
  minutes_plan:           'starter',         // Media Jornada tier reference
  minutes_included:       0,                 // no voz
  minutes_used:           0,
  ai_ops_limit:           0,                 // durante impl: 0. Al activar → 500 (starter tareas)
  ai_ops_used:            0,
  vapi_agent_id:          null,              // sin voz
  elevenlabs_voice_id:    null,              // sin voz
  phone_number:           '',
  business_phone_display: '',
  transfer_whatsapp:      null,
  timezone:               'America/Monterrey',
  business_address:       'Av. Pablo Gonzalez 702, Chepevera, Monterrey, NL 64030',
  features: {
    meerkat_role_id:   'nami',
    is_coordinator:    false,
    inventory_excel:   true,
    voice_enabled:     false,
    role_color:        '#EA580C',
  },
};

// ─────────────────────────── output helpers ────────────────────────
function banner(label) {
  console.log('\n' + '─'.repeat(72));
  console.log(`  ${label}`);
  console.log('─'.repeat(72));
}
function pretty(obj) { console.log(JSON.stringify(obj, null, 2)); }

// ─────────────────────────── main ──────────────────────────────────
async function main() {
  banner(`MODO: ${MODE}`);

  // Preflight: verificar que no exista ya
  const { data: existingOrg } = await supa
    .from('organizations')
    .select('portal_email, name, created_at')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();

  const { data: existingAgents } = await supa
    .from('voice_agents')
    .select('id, agent_name, active, billing_status, created_at')
    .eq('portal_email', PORTAL_EMAIL);

  banner('PREFLIGHT');
  console.log(`org existente con portal_email=${PORTAL_EMAIL}: ${existingOrg ? 'SÍ' : 'no'}`);
  if (existingOrg) pretty(existingOrg);
  console.log(`voice_agents con ese portal_email: ${existingAgents?.length ?? 0}`);
  if (existingAgents?.length) pretty(existingAgents);

  if (existingOrg && APPLY) {
    console.error('\n[ABORT] La org ya existe. Corre un UPDATE dedicado si quieres modificar.');
    process.exit(1);
  }
  if (existingAgents?.length && APPLY) {
    console.error('\n[ABORT] Ya hay voice_agents con ese portal_email. No re-provisiono.');
    process.exit(1);
  }

  banner('PAYLOAD organizations');
  pretty(orgPayload);

  banner('PAYLOAD voice_agents (Nami)');
  pretty(namiPayload);

  if (!APPLY) {
    banner('DRY-RUN COMPLETO');
    console.log('Sin cambios en DB. Para aplicar corre con --apply.');
    console.log(`Portal token generado (se re-genera en cada corrida): ${PORTAL_TOKEN}`);
    console.log(`URL portal quedará: https://www.centinelia.mx/portal/${PORTAL_TOKEN}`);
    return;
  }

  banner('APLICANDO INSERTS');

  const { data: orgInserted, error: orgErr } = await supa
    .from('organizations')
    .insert(orgPayload)
    .select('portal_email, name, portal_token')
    .single();

  if (orgErr) {
    console.error('[ORG INSERT ERROR]', orgErr);
    process.exit(1);
  }
  console.log('org insertada OK:');
  pretty(orgInserted);

  const { data: namiInserted, error: namiErr } = await supa
    .from('voice_agents')
    .insert(namiPayload)
    .select('id, agent_name, role, portal_email, active, billing_status')
    .single();

  if (namiErr) {
    console.error('[NAMI INSERT ERROR]', namiErr);
    console.error('[!] La org quedó insertada. Revisa manualmente antes de re-correr.');
    process.exit(1);
  }
  console.log('\nNami insertada OK:');
  pretty(namiInserted);

  banner('SIGUIENTES PASOS');
  console.log(`1. Portal URL para Camila: https://www.centinelia.mx/portal/${orgInserted.portal_token}`);
  console.log(`2. Camila hace OAuth de Outlook (Files.ReadWrite.All + Sites.ReadWrite.All).`);
  console.log(`3. Nami queda active=false hasta que verifiquemos el pipeline E2E.`);
  console.log(`4. Al activar: UPDATE voice_agents SET active=true, billing_status='activo', ai_ops_limit=500`);
  console.log(`   + cobrar $14,990 setup + $2,997/mes Media Jornada tareas starter (0 min + 500 tareas).`);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
