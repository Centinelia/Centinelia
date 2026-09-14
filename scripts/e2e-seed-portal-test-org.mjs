#!/usr/bin/env node
/**
 * Seed idempotente de la org de test para Playwright E2E.
 *
 * Corre con:
 *   node scripts/e2e-seed-portal-test-org.mjs
 *
 * Requiere en env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Crea/actualiza:
 *   organizations         → e2e-test@centinelia.mx / e2e-token-abcdef123456
 *   voice_agents          → un empleado Nia activo, meerkat_role_id='nia'
 *
 * Al final imprime a stdout:
 *   E2E_PORTAL_EMAIL=e2e-test@centinelia.mx
 *   E2E_PORTAL_TOKEN=e2e-token-abcdef123456
 *   E2E_PORTAL_PASSWORD=e2e-password-known
 *   E2E_AGENT_ID=<uuid>
 *
 * Pega esas 4 líneas en `.env.local` para que los specs Playwright las
 * consuman via process.env.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'node:crypto';

const URL   = process.env.SUPABASE_URL;
const KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('FALTAN env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const EMAIL    = 'e2e-test@centinelia.mx';
const TOKEN    = 'e2e-token-abcdef123456';
const PASSWORD = 'e2e-password-known';

// Hash de password compatible con verifyPassword del portal (scrypt).
function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function main() {
  // 1. Upsert organization
  const { error: orgErr } = await supabase
    .from('organizations')
    .upsert({
      portal_email:         EMAIL,
      portal_token:         TOKEN,
      portal_password_hash: hashPassword(PASSWORD),
      business_name:        'E2E Test Org',
      account_status:       'active',
    }, { onConflict: 'portal_email' });
  if (orgErr) throw orgErr;

  // 2. Upsert voice_agent
  const { data: existingAgent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', EMAIL)
    .eq('agent_name', 'Nia E2E')
    .maybeSingle();

  let agentId = existingAgent?.id;
  if (!agentId) {
    const { data, error } = await supabase
      .from('voice_agents')
      .insert({
        portal_email:     EMAIL,
        agent_name:       'Nia E2E',
        role:             'Recepcionista',
        active:           true,
        billing_status:   'active',
        plan:             'pro',
        minutes_plan:     'starter',
        jornada_type:     'combinada',
        features:         { meerkat_role_id: 'nia', is_coordinator: false },
        ai_ops_used:      0,
        ai_ops_limit:     100,
        onboarding_completed: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    agentId = data.id;
  } else {
    await supabase.from('voice_agents')
      .update({
        active: true,
        client_paused: false,
        billing_status: 'active',
      })
      .eq('id', agentId);
  }

  console.log(`E2E_PORTAL_EMAIL=${EMAIL}`);
  console.log(`E2E_PORTAL_TOKEN=${TOKEN}`);
  console.log(`E2E_PORTAL_PASSWORD=${PASSWORD}`);
  console.log(`E2E_AGENT_ID=${agentId}`);
  console.error('\nSeed OK. Pega las 4 líneas de arriba en .env.local.');
}

main().catch(err => {
  console.error('Seed FAIL:', err);
  process.exit(1);
});
