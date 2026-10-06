// Top-up de 100 ops al pool de AC Proyectos (Nami) pre-Meet 2026-10-06.
// Insert grant idempotente en ops_ledger (marcado con source único).
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/topup-nami-pre-meet.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const TOPUP_SOURCE = 'pre-meet-topup-2026-10-06';
const AMOUNT = 100;

console.log('── 1. Balance ANTES ──');
const { data: pre, error: preErr } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
if (preErr) { console.error('get_ops_pool_balance err:', preErr); process.exit(1); }
console.log('  balance:', pre);

console.log('\n── 2. Verificar idempotencia ──');
const { data: existing } = await sb.from('ops_ledger')
  .select('id, amount, kind, created_at')
  .eq('portal_email', PORTAL)
  .eq('source', TOPUP_SOURCE);
if ((existing?.length ?? 0) > 0) {
  console.log('  Grant con source=' + TOPUP_SOURCE + ' ya existe — skip insert (idempotente)');
  console.log('  Existente:', existing[0]);
} else {
  console.log('\n── 3. Insert grant +' + AMOUNT + ' ──');
  const { error: insErr } = await sb.from('ops_ledger').insert({
    portal_email: PORTAL,
    agent_id:     NAMI,
    amount:       AMOUNT,
    kind:         'manual_grant',
    source:       TOPUP_SOURCE,
    description:  `Top-up pre-Meet Camila 2026-10-06. +${AMOUNT} ops para cubrir los ~6 ops del demo con buffer.`,
  });
  if (insErr) { console.error('insert err:', insErr); process.exit(1); }
  console.log('  ✓ Grant +' + AMOUNT + ' insertado');
}

console.log('\n── 4. Refresh cache ──');
const { error: refreshErr } = await sb.rpc('refresh_ops_pool_cache', { p_portal_email: PORTAL });
if (refreshErr) { console.error('refresh err:', refreshErr); process.exit(1); }
console.log('  ✓ Cache refreshed');

console.log('\n── 5. Balance DESPUÉS ──');
const { data: post } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
console.log('  balance:', post);

const delta = Number(post) - Number(pre);
console.log('\n  Delta:', delta >= 0 ? '+' + delta : delta);

console.log('\n── 6. Account_ops cache verificación ──');
const { data: acct } = await sb.from('account_ops').select('*').eq('portal_email', PORTAL).maybeSingle();
console.log('  account_ops:', JSON.stringify(acct));

console.log('\n══════════════════════════════════════════');
console.log('✓ TOP-UP APLICADO. Balance disponible para el Meet:', post);
console.log('══════════════════════════════════════════');
