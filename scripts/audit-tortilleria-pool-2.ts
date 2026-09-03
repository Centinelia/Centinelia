import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

(async () => {
  // 1) organizations SIN filtrar por columnas exóticas
  const { data: org } = await s.from('organizations').select('*').eq('portal_email', PORTAL).maybeSingle();
  if (org) {
    const relevant = ['portal_email', 'portal_token', 'plan', 'minutes_plan', 'minutes_included', 'ops_included', 'ops_used', 'ops_balance', 'ops_reset_date', 'subscription_status', 'created_at'];
    console.log('=== organizations (relevantes) ===');
    for (const k of relevant) if (k in org) console.log(`  ${k}: ${JSON.stringify((org as any)[k])}`);
  } else {
    console.log('=== organizations: NULL ===');
  }

  // 2) Buscar tabla de pool de tareas — grep candidates
  const candidates = ['account_ops', 'ops_pool', 'task_pool', 'account_tasks', 'org_ops', 'org_pool'];
  for (const t of candidates) {
    const { data, error } = await s.from(t).select('*').eq('portal_email', PORTAL).maybeSingle();
    if (!error) console.log(`\n=== ${t}: ${data ? JSON.stringify(data) : '(no row)'} ===`);
  }

  // 3) ¿voice_agents tiene ops_used/included?
  const { data: agent } = await s.from('voice_agents')
    .select('id, agent_name, minutes_used, minutes_included, ops_used, ops_included, ops_balance, features')
    .eq('portal_email', PORTAL).maybeSingle();
  if (agent) {
    console.log('\n=== voice_agents ops fields ===');
    const relevant = ['agent_name','minutes_used','minutes_included','ops_used','ops_included','ops_balance'];
    for (const k of relevant) if (k in agent) console.log(`  ${k}: ${JSON.stringify((agent as any)[k])}`);
  }

  // 4) Rows del ledger viejo (con el email typo) — para ver si sigue contando
  const OLD = 'servicioalcliente@tortillaestrella.com.mx';
  const { count: mlOld } = await s.from('minutes_ledger').select('*', { count: 'exact', head: true }).eq('portal_email', OLD);
  const { count: olOld } = await s.from('ops_ledger').select('*', { count: 'exact', head: true }).eq('portal_email', OLD);
  console.log(`\n=== rows con email VIEJO (typo, huérfanos) ===`);
  console.log(`  minutes_ledger: ${mlOld} rows`);
  console.log(`  ops_ledger:     ${olOld} rows`);

  // 5) sum minutes_ledger VIEJO
  const { data: oldMinutes } = await s.from('minutes_ledger').select('amount').eq('portal_email', OLD);
  const oldMTotal = (oldMinutes ?? []).reduce((sum, r) => sum + (r.amount as number), 0);
  console.log(`  sum minutes viejo: ${oldMTotal}`);
  const { data: oldOps } = await s.from('ops_ledger').select('amount').eq('portal_email', OLD);
  const oldOTotal = (oldOps ?? []).reduce((sum, r) => sum + (r.amount as number), 0);
  console.log(`  sum ops viejo:     ${oldOTotal}`);
})().catch(e => { console.error(e); process.exit(1); });
