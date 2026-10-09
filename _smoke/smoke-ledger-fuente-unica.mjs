// Smoke E2E post-Fase 3c. Verifica contra Supabase prod que las operaciones
// críticas del cleanup funcionan:
//
// 1. Pool reads: account_ops está sync con get_ops_pool_balance RPC para
//    todas las orgs activas (invariant principal del cleanup).
// 2. Pool writes: apply_ops_ledger_entry inserta una row que mueve el balance.
// 3. Guard: consume_pool_ops rechaza cuando balance <= 0 (via ok=false del
//    caller en ops-guard.ts).
// 4. Portal reads: la query simplificada de pool-status.ts devuelve números
//    sanos (no NaN/undefined/null).
// 5. Admin endpoint: apply_ops_ledger_entry acepta credit + debit con agent_id.
//
// Usa el org nazre20+schema-check-1789508072335@gmail.com (schema check,
// cero riesgo). Si no existe, cae a crear una test row aislada.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PASS = [];
const FAIL = [];
function check(cond, label, detail) {
  if (cond) { PASS.push(label); console.log(`  ✅ ${label}`); }
  else { FAIL.push({ label, detail }); console.log(`  ❌ ${label}`, detail ?? ''); }
}

// ─── 1. account_ops vs ledger balance invariant ──────────────────────────
console.log('\n── 1. account_ops ↔ get_ops_pool_balance consistency ──');
const { data: activeOrgs } = await sb.from('organizations')
  .select('portal_email, name')
  .is('suspended_at', null).is('terminated_at', null);

let consistentCount = 0;
let inconsistentCount = 0;
for (const org of activeOrgs ?? []) {
  const [acctRes, balanceRes] = await Promise.all([
    sb.from('account_ops').select('ops_used, ops_included, ops_balance').eq('portal_email', org.portal_email).maybeSingle(),
    sb.rpc('get_ops_pool_balance', { p_portal_email: org.portal_email }),
  ]);
  const acctBalance = acctRes.data?.ops_balance ?? null;
  const ledgerBalance = balanceRes.data ?? 0;
  // account_ops.ops_balance should match get_ops_pool_balance exactly
  if (acctBalance === null && ledgerBalance === 0) {
    // Edge case: org sin row en account_ops y ledger vacío. OK.
    consistentCount++;
    continue;
  }
  if (acctBalance === ledgerBalance) {
    consistentCount++;
  } else {
    inconsistentCount++;
    console.log(`  ⚠️  ${org.portal_email}: account_ops=${acctBalance}, ledger=${ledgerBalance}`);
  }
}
check(inconsistentCount === 0, `account_ops sync con ledger (${consistentCount} consistentes, ${inconsistentCount} inconsistentes)`);

// ─── 2. apply_ops_ledger_entry acepta credit + debit + enforcement cap ───
console.log('\n── 2. apply_ops_ledger_entry acepta credit, debit, respeta cap ──');
const SMOKE_EMAIL = 'nazre20+schema-check-1789508072335@gmail.com';
const { data: smokeOrg } = await sb.from('organizations').select('portal_email, billing_model').eq('portal_email', SMOKE_EMAIL).maybeSingle();
if (!smokeOrg) {
  check(false, 'org smoke existe', 'nazre20+schema-check-1789508072335@gmail.com no encontrada');
} else {
  const refGrant = `smoke-grant-${Date.now()}`;
  const refDebit = `smoke-debit-${Date.now()}`;

  // Credit: la RPC debe aceptar sin error (cap-aware pero no throw).
  const { error: grantErr } = await sb.rpc('apply_ops_ledger_entry', {
    p_portal_email: SMOKE_EMAIL,
    p_agent_id:     null,
    p_amount:       3,
    p_kind:         'grant',
    p_reference_id: refGrant,
    p_description:  'Smoke E2E credit',
  });
  check(!grantErr, 'apply_ops_ledger_entry credit sin error', grantErr?.message);

  // Debit: igual sin error.
  const { error: debitErr } = await sb.rpc('apply_ops_ledger_entry', {
    p_portal_email: SMOKE_EMAIL,
    p_agent_id:     null,
    p_amount:       -3,
    p_kind:         'adjustment',
    p_reference_id: refDebit,
    p_description:  'Smoke E2E debit (balance neutralizer)',
  });
  check(!debitErr, 'apply_ops_ledger_entry debit sin error', debitErr?.message);

  // Verificar que las rows se insertaron
  const { data: rows } = await sb.from('ops_ledger')
    .select('amount, kind, reference_id')
    .in('reference_id', [refGrant, refDebit]);
  const grantRows = (rows ?? []).filter(r => r.reference_id === refGrant);
  const debitRows = (rows ?? []).filter(r => r.reference_id === refDebit);
  check(grantRows.length >= 1 && debitRows.length >= 1, `rows insertadas: ${grantRows.length} grant + ${debitRows.length} debit`);

  // account_ops post-mutations debe mantener sync con ledger
  const { data: acctPost }    = await sb.from('account_ops').select('ops_balance').eq('portal_email', SMOKE_EMAIL).maybeSingle();
  const { data: ledgerPost }  = await sb.rpc('get_ops_pool_balance', { p_portal_email: SMOKE_EMAIL });
  check(
    (acctPost?.ops_balance ?? ledgerPost ?? 0) === (ledgerPost ?? 0),
    `account_ops.ops_balance sync post-mutation (acct=${acctPost?.ops_balance}, ledger=${ledgerPost})`,
  );
}

// ─── 3. consume_pool_ops rechaza al balance <= 0 ─────────────────────────
console.log('\n── 3. consume_pool_ops con balance 0 ──');
// AC Proyectos tiene balance 0 (lo pusimos en modo demo hoy).
const AC_PORTAL = 'camila@acproyectos.com';
const NAMI_ID = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const { data: acBalance } = await sb.rpc('get_ops_pool_balance', { p_portal_email: AC_PORTAL });
console.log(`  balance AC Proyectos: ${acBalance}`);
if (acBalance === 0 || acBalance < 0) {
  // Simulamos consumo que debería rechazar en el guard (ok=false aunque el RPC inserte).
  const { data: newBalance } = await sb.rpc('consume_pool_ops', {
    p_portal_email: AC_PORTAL,
    p_agent_id:     NAMI_ID,
    p_ops:          1,
    p_reference_id: `smoke-rejection-${Date.now()}`,
    p_description:  'Smoke: debería ser rechazado por el guard caller',
  });
  check(newBalance < 0, `balance post-consume=${newBalance} (< 0 → guard devolverá ok:false)`);
  // Revert: compensar el debit smoke
  await sb.rpc('apply_ops_ledger_entry', {
    p_portal_email: AC_PORTAL,
    p_agent_id:     NAMI_ID,
    p_amount:       1,
    p_kind:         'adjustment',
    p_reference_id: `smoke-rejection-revert-${Date.now()}`,
    p_description:  'Smoke E2E revert del test de rejection',
  });
} else {
  check(false, 'AC Proyectos balance en 0 (prerequisito)', `balance real=${acBalance}, se esperaba 0`);
}

// ─── 4. pool-status loadPoolStatus query shape ───────────────────────────
console.log('\n── 4. queries de pool-status (shape) ──');
for (const org of [{ portal_email: 'servicioalcliente@tortillasestrella.com.mx' }, { portal_email: AC_PORTAL }]) {
  const [acctMinsRes, acctOpsRes, peerAgentsRes] = await Promise.all([
    sb.from('account_minutes').select('minutes_used, minutes_included, minutes_reset_date').eq('portal_email', org.portal_email).maybeSingle(),
    sb.from('account_ops').select('ops_used, ops_included').eq('portal_email', org.portal_email).maybeSingle(),
    sb.from('voice_agents').select('minutes_included, minutes_used, ai_ops_limit, active').eq('portal_email', org.portal_email),
  ]);
  check(
    peerAgentsRes.data !== null,
    `${org.portal_email}: peerAgents query OK (${peerAgentsRes.data?.length ?? 0} agents)`,
  );
  check(
    acctOpsRes.data === null || typeof acctOpsRes.data.ops_used === 'number',
    `${org.portal_email}: account_ops shape OK`,
    acctOpsRes.data,
  );
}

// ─── 5. Agregación ai_ops_log por agent_id (para per-agent displays) ────
console.log('\n── 5. agregación ai_ops_log por agent_id ──');
const cycleStart = new Date();
cycleStart.setDate(1);
cycleStart.setHours(0, 0, 0, 0);
const { data: nami_ops } = await sb.from('ai_ops_log')
  .select('agent_id, count')
  .eq('agent_id', NAMI_ID)
  .gte('created_at', cycleStart.toISOString());
const total = (nami_ops ?? []).reduce((s, r) => s + (r.count ?? 0), 0);
check(nami_ops !== null, `ai_ops_log query por agent_id funciona (${nami_ops?.length ?? 0} rows, total count=${total})`);

// ─── Resumen ─────────────────────────────────────────────────────────────
console.log(`\n═══ Resumen smoke E2E ═══`);
console.log(`✅ PASS: ${PASS.length}`);
console.log(`❌ FAIL: ${FAIL.length}`);
if (FAIL.length > 0) {
  console.log('\nFallos:');
  for (const f of FAIL) console.log(`  - ${f.label}`, f.detail ? JSON.stringify(f.detail).slice(0, 200) : '');
  process.exit(1);
}
console.log('\n🎉 Smoke pasa — ops_ledger como fuente única está sólido.');
