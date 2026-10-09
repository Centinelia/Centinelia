// Top-up al pool de AC Proyectos (Nami) para que tenga 200+ tareas disponibles
// antes del Meet con Camila. Idempotente por source único.
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/topup-nami-200-pre-meet.mjs

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const TARGET = 200;
const TOPUP_SOURCE = 'pre-meet-topup-200-2026-10-06';

console.log('── Balance ANTES ──');
const { data: pre, error: preErr } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
if (preErr) { console.error('rpc err:', preErr); process.exit(1); }
const preBalance = Number(pre);
console.log('  balance actual:', preBalance);

if (preBalance >= TARGET) {
  console.log(`\n✓ Ya tienes ${preBalance} tareas (>= ${TARGET}). No hace falta top-up.`);
  process.exit(0);
}

const needed = TARGET - preBalance;
const amount = Math.max(needed, 50);  // mínimo 50 por si acaso

// Verifica idempotencia
const { data: existing } = await sb.from('ops_ledger')
  .select('id, amount')
  .eq('portal_email', PORTAL)
  .eq('source', TOPUP_SOURCE);
if ((existing?.length ?? 0) > 0) {
  console.log(`\n⚠ Grant con source=${TOPUP_SOURCE} ya existe (${existing[0].amount} ops) pero balance sigue en ${preBalance}.`);
  console.log('  Insertando grant adicional con source + "-retry"...');
}

const sourceToUse = (existing?.length ?? 0) > 0 ? TOPUP_SOURCE + '-retry' : TOPUP_SOURCE;

console.log(`\n── Insert grant +${amount} (source: ${sourceToUse}) ──`);
const { error: insErr } = await sb.from('ops_ledger').insert({
  portal_email: PORTAL,
  agent_id:     NAMI,
  amount,
  kind:         'manual_grant',
  source:       sourceToUse,
  description:  `Top-up pre-Meet Camila 2026-10-06. Target >= ${TARGET}, +${amount} ops.`,
});
if (insErr) { console.error('insert err:', insErr); process.exit(1); }
console.log('  ✓ Grant insertado');

console.log('\n── Refresh cache ──');
const { error: refreshErr } = await sb.rpc('refresh_ops_pool_cache', { p_portal_email: PORTAL });
if (refreshErr) { console.error('refresh err:', refreshErr); process.exit(1); }

console.log('\n── Balance DESPUÉS ──');
const { data: post } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
const postBalance = Number(post);
console.log('  balance final:', postBalance);
console.log(`  delta: +${postBalance - preBalance}`);

if (postBalance >= TARGET) {
  console.log(`\n✓ Listo. Nami tiene ${postBalance} tareas disponibles (>= ${TARGET}).`);
} else {
  console.log(`\n⚠ Balance ${postBalance} sigue debajo de ${TARGET}. Revisar manualmente.`);
}
