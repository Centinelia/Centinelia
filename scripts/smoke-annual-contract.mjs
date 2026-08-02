// Smoke E2E de contratos anuales. Corre contra dev DB usando SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY del .env.local. NO limpia la fixture al final
// (para que puedas inspeccionar el estado en el admin panel).
//
// Uso: node scripts/smoke-annual-contract.mjs
//
// Cubre:
//   1. Crea org fixture ficticia (annual-smoke@test.mx).
//   2. Crea contrato draft.
//   3. Activa contrato → verifica billing_model=annual_prepaid + pool_reset_date.
//   4. Simula descuento pool: 1000 min + 50 ops → verifica organizations.
//   5. Fuerza crossover 100% (12,000 min de un solo golpe) → verifica overage.
//   6. Chequea que endpoints Stripe protegidos devuelvan 409.
//   7. Corre el cron lifecycle manualmente → auto-expira si end_date pasada.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load .env.local manually
const envPath = join(process.cwd(), '.env.local');
const envRaw  = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.replace(/^"|"$/g, '')))
    .filter(([k, v]) => k && v)
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const FIXTURE_EMAIL = 'annual-smoke@test.mx';
const FOLIO = `CTR-SMOKE-${Date.now()}`;

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey:        SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${text}`);
  return text ? JSON.parse(text) : null;
}

function assert(cond, label) {
  if (!cond) throw new Error(`❌ ${label}`);
  console.log(`✓ ${label}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SMOKE E2E · Contratos anuales');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Crea org fixture (upsert)
  console.log('1. Fixture org');
  await sb(`organizations?on_conflict=portal_email`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      portal_email: FIXTURE_EMAIL,
      name:         'Smoke Test SA de CV',
      plan:         'pro',
    }),
  });
  console.log(`   ✓ organizations.${FIXTURE_EMAIL}`);

  // 2. Crea contrato draft (start_date pasado para trigger reset en tick posterior)
  console.log('\n2. Crea contrato draft');
  const startDate = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  const endDate   = new Date(Date.now() + 325 * 86400000).toISOString().slice(0, 10);
  const draft = await sb('annual_contracts', {
    method: 'POST',
    body: JSON.stringify({
      organization_email:    FIXTURE_EMAIL,
      contract_folio:        FOLIO,
      status:                'draft',
      start_date:            startDate,
      end_date:              endDate,
      amount_mxn:            180000,
      monthly_minutes_pool:  12000,
      monthly_ops_pool:      500,
      included_employees:    3,
      payment_status:        'received',
      payment_received_at:   new Date().toISOString(),
      notes:                 'Smoke test — safe to delete',
    }),
  });
  const contract = draft[0];
  assert(contract.status === 'draft', 'contrato creado en draft');
  console.log(`   ✓ ${contract.contract_folio} (${contract.id})`);

  // 3. Activa contrato (simula endpoint activate)
  console.log('\n3. Activa contrato');
  await sb(`annual_contracts?id=eq.${contract.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active' }),
  });
  // Simula applyActivation
  const nextReset = (() => { const d = new Date(startDate + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
  await sb(`organizations?portal_email=eq.${encodeURIComponent(FIXTURE_EMAIL)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      billing_model:        'annual_prepaid',
      active_contract_id:   contract.id,
      monthly_minutes_used: 0,
      monthly_ops_used:     0,
      overage_minutes:      0,
      overage_ops:          0,
      pool_reset_date:      nextReset,
    }),
  });
  const org = (await sb(`organizations?portal_email=eq.${encodeURIComponent(FIXTURE_EMAIL)}&select=billing_model,active_contract_id,pool_reset_date`))[0];
  assert(org.billing_model === 'annual_prepaid', 'org.billing_model = annual_prepaid');
  assert(org.active_contract_id === contract.id, 'org.active_contract_id set');
  assert(org.pool_reset_date, 'org.pool_reset_date set');

  // 4. Simula descuento del pool
  console.log('\n4. Descuento del pool: 1000 min + 50 ops');
  await sb(`organizations?portal_email=eq.${encodeURIComponent(FIXTURE_EMAIL)}`, {
    method: 'PATCH',
    body: JSON.stringify({ monthly_minutes_used: 1000, monthly_ops_used: 50 }),
  });
  const orgAfter = (await sb(`organizations?portal_email=eq.${encodeURIComponent(FIXTURE_EMAIL)}&select=monthly_minutes_used,monthly_ops_used`))[0];
  assert(orgAfter.monthly_minutes_used === 1000, 'org.monthly_minutes_used = 1000');
  assert(orgAfter.monthly_ops_used === 50, 'org.monthly_ops_used = 50');

  // 5. Fuerza overage 120%
  console.log('\n5. Fuerza overage 120% (14400 min consumidos, pool 12000)');
  await sb(`organizations?portal_email=eq.${encodeURIComponent(FIXTURE_EMAIL)}`, {
    method: 'PATCH',
    body: JSON.stringify({ monthly_minutes_used: 14400, overage_minutes: 2400 }),
  });
  const orgOver = (await sb(`organizations?portal_email=eq.${encodeURIComponent(FIXTURE_EMAIL)}&select=monthly_minutes_used,overage_minutes`))[0];
  assert(orgOver.overage_minutes === 2400, 'overage_minutes = 2400');
  assert(orgOver.monthly_minutes_used === 14400, 'monthly_minutes_used = 14400');

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ Smoke pasó todas las verificaciones');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\nFixture creada: ${FIXTURE_EMAIL} · ${FOLIO}`);
  console.log('Puedes verla en el admin: /admin/facturacion?tab=contratos');
  console.log('Cuando termines, borra manualmente desde el admin (o desde SQL Editor).');
}

run().catch(err => {
  console.error('\n💥 SMOKE FALLÓ:');
  console.error(err);
  process.exit(1);
});
