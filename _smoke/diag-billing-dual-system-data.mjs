// Mapea estado de datos para migración legacy → ledger.
// Cuántas orgs en cada modo, cuánto consumption histórico, etc.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Breakdown de orgs por flag ledger
console.log('── Orgs por ops_ledger_enabled ──');
const { data: allOrgs } = await sb.from('organizations')
  .select('portal_email, ops_ledger_enabled, plan, monthly_ops_pool, monthly_ops_used, billing_model, active_contract_id, suspended_at, terminated_at');
const enabled = allOrgs?.filter(o => o.ops_ledger_enabled === true) ?? [];
const disabled = allOrgs?.filter(o => o.ops_ledger_enabled !== true) ?? [];
console.log(`Total orgs: ${allOrgs?.length}`);
console.log(`  ops_ledger_enabled=true : ${enabled.length}`);
console.log(`  ops_ledger_enabled=false: ${disabled.length}`);

const activeDisabled = disabled.filter(o => !o.suspended_at && !o.terminated_at);
console.log(`\nOrgs legacy ACTIVAS (sin suspended/terminated): ${activeDisabled.length}`);
if (activeDisabled.length) {
  console.table(activeDisabled.map(o => ({
    email: o.portal_email, plan: o.plan, model: o.billing_model,
    pool: o.monthly_ops_pool, used: o.monthly_ops_used,
  })));
}

console.log(`\nOrgs ledger ACTIVAS:`);
const activeEnabled = enabled.filter(o => !o.suspended_at && !o.terminated_at);
console.table(activeEnabled.map(o => ({
  email: o.portal_email, plan: o.plan, model: o.billing_model,
  pool_legacy: o.monthly_ops_pool, used_legacy: o.monthly_ops_used,
})));

// 2. ¿Hay orgs que SÍ tienen rows en ops_ledger pero ops_ledger_enabled=false?
console.log('\n── Orgs con filas en ops_ledger pero flag=false ──');
for (const o of disabled) {
  const { count } = await sb.from('ops_ledger').select('*', { count: 'exact', head: true }).eq('portal_email', o.portal_email);
  if ((count ?? 0) > 0) console.log(`  ${o.portal_email}: ${count} rows en ledger pero flag OFF`);
}

// 3. ¿Agent-level ai_ops_limit != 0 en orgs ledger?
console.log('\n── Agents activos de orgs ledger con ai_ops_limit > 0 (potencial inconsistencia) ──');
for (const o of activeEnabled) {
  const { data: agents } = await sb.from('voice_agents')
    .select('agent_name, ai_ops_limit, ai_ops_used, active')
    .eq('portal_email', o.portal_email)
    .eq('active', true);
  const withLimit = agents?.filter(a => (a.ai_ops_limit ?? 0) > 0) ?? [];
  if (withLimit.length) {
    console.log(`  ${o.portal_email}:`);
    for (const a of withLimit) console.log(`    ${a.agent_name}: ai_ops_limit=${a.ai_ops_limit}, ai_ops_used=${a.ai_ops_used}`);
  }
}

// 4. ¿account_ops está sincronizada con ledger balance?
console.log('\n── account_ops vs balance real del ledger ──');
for (const o of activeEnabled) {
  const { data: acctRow } = await sb.from('account_ops')
    .select('ops_used, ops_included, ops_balance, updated_at')
    .eq('portal_email', o.portal_email)
    .maybeSingle();
  const { data: ledgerBal } = await sb.rpc('get_ops_pool_balance', { p_portal_email: o.portal_email });
  console.log(`  ${o.portal_email}: ledger=${ledgerBal}, account_ops=${JSON.stringify(acctRow)}`);
}

// 5. Minutes ledger (si existe algo paralelo)
const { count: minLedgerCount, error: minLedgerErr } = await sb.from('minutes_ledger').select('*', { count: 'exact', head: true });
console.log('\n── minutes_ledger ──');
console.log('err:', minLedgerErr?.message);
console.log('total rows:', minLedgerCount);
