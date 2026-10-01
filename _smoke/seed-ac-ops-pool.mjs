// One-shot repair del estado AC Proyectos tras bug 2026-09-30.
//
// Hace todo lo necesario para que Camila pueda chatear con Nami ahora:
//   1. billing_status: 'pendiente' → 'activo' (sin esto get_ops_pool_cap
//      excluía a Nami y el próximo reset cron nukeaba el pool).
//   2. ai_ops_limit: 500 (en caso de que esté mal).
//   3. active: true.
//   4. Insert initial_grant +500 en ops_ledger (si no existe aún).
//   5. Insert refund +12 por los 4 chats fallidos (429 ops_limit_reached,
//      Nami nunca respondió, user authorized en sesión).
//   6. Refresh account_ops cache.
//   7. Simulación de consume → ops-guard.ok=true.
//
// Idempotente: skip del grant si ya existe. Script seguro de re-correr.
//
// Para futuras orgs: usa scripts/ac/provision-nami.mjs --activate (misma
// lógica sin el refund one-shot).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envRaw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => {
  const i = l.indexOf('=');
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { data: pre } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
console.log('Balance ANTES:', pre);

const { error: updErr } = await sb
  .from('voice_agents')
  .update({ active: true, billing_status: 'activo', ai_ops_limit: 500 })
  .eq('id', NAMI);
if (updErr) { console.error('voice_agents update err:', updErr); process.exit(1); }
console.log('Nami → active=true, billing_status=activo, ai_ops_limit=500');

const { data: existingGrant } = await sb
  .from('ops_ledger')
  .select('id, amount, kind')
  .eq('portal_email', PORTAL)
  .in('kind', ['initial_grant', 'annual_grant', 'monthly_grant'])
  .limit(1);
if ((existingGrant?.length ?? 0) > 0) {
  console.log('Ya existe grant previo — skip insert para no duplicar:', existingGrant);
} else {
  const grantRes = await sb.from('ops_ledger').insert({
    portal_email: PORTAL,
    agent_id:     null,
    amount:       500,
    kind:         'initial_grant',
    source:       'manual_pilot_provisioning',
    description:  'Grant inicial piloto Mes 1 AC Proyectos (Nami ai_ops_limit=500). Fix bug 2026-09-30: provisioning script no sembró ledger.',
  });
  if (grantRes.error) { console.error('grant err:', grantRes.error); process.exit(1); }
  console.log('Grant +500 insertado');
}

const { data: existingRefund } = await sb
  .from('ops_ledger')
  .select('id')
  .eq('portal_email', PORTAL)
  .eq('source', 'chat_failed_no_response')
  .limit(1);
if ((existingRefund?.length ?? 0) > 0) {
  console.log('Refund ya aplicado — skip');
} else {
  const refundRes = await sb.from('ops_ledger').insert({
    portal_email: PORTAL,
    agent_id:     NAMI,
    amount:       12,
    kind:         'refund',
    source:       'chat_failed_no_response',
    description:  'Refund 4 chats fallidos 2026-09-30 (429 ops_limit_reached, Nami nunca respondió, pool sin seedear). 4 × 3 ops = 12.',
  });
  if (refundRes.error) { console.error('refund err:', refundRes.error); process.exit(1); }
  console.log('Refund +12 insertado');
}

const { error: refreshErr } = await sb.rpc('refresh_ops_pool_cache', { p_portal_email: PORTAL });
if (refreshErr) { console.error('refresh err:', refreshErr); process.exit(1); }
console.log('Cache refreshed');

const { data: post } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
console.log('Balance DESPUES:', post);
const { data: acct } = await sb.from('account_ops').select('*').eq('portal_email', PORTAL).maybeSingle();
console.log('account_ops DESPUES:', JSON.stringify(acct));

// Sanity: verify the exact ops-guard check works now
console.log('\nSIMULATION — consume 3 ops (chat), verify ok, rollback:');
const { data: sim } = await sb.rpc('consume_pool_ops', {
  p_portal_email: PORTAL,
  p_agent_id:     NAMI,
  p_ops:          3,
  p_description:  'DRY-RUN simulation post-seed verification',
});
console.log('  Balance after -3 consume:', sim, '→ ops-guard ok:', sim >= 0);

await sb.from('ops_ledger').insert({
  portal_email: PORTAL,
  agent_id:     NAMI,
  amount:       3,
  kind:         'refund',
  source:       'dry_run_rollback',
  description:  'Rollback of DRY-RUN verification above',
});
const { data: final } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
console.log('  Balance after rollback:', final);

console.log('\nREPAIR DONE. Camila puede volver al portal y chatear con Nami.');
