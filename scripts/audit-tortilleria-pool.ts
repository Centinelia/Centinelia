import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

(async () => {
  // 1) voice_agents del org
  const { data: agents } = await s.from('voice_agents')
    .select('id, agent_name, active, minutes_used, minutes_included, minutes_plan, minutes_reset_date, plan')
    .eq('portal_email', PORTAL);
  console.log('=== voice_agents ===');
  for (const a of agents ?? []) {
    console.log(`  ${a.agent_name} (${(a.id as string).slice(0,8)}) active=${a.active}`);
    console.log(`    minutes_used=${a.minutes_used} included=${a.minutes_included} plan=${a.plan}/${a.minutes_plan} reset=${a.minutes_reset_date}`);
  }

  // 2) account_minutes (org-level pool si existe)
  const { data: am } = await s.from('account_minutes').select('*').eq('portal_email', PORTAL);
  console.log('\n=== account_minutes ===');
  for (const row of am ?? []) console.log(' ', JSON.stringify(row, null, 2));

  // 3) minutes_ledger — sum vs recent rows
  const { data: mLedger, count: mCount } = await s.from('minutes_ledger')
    .select('amount, kind, source, created_at, description', { count: 'exact' })
    .eq('portal_email', PORTAL)
    .order('created_at', { ascending: false });
  const mTotal = (mLedger ?? []).reduce((sum, r) => sum + (r.amount as number), 0);
  console.log(`\n=== minutes_ledger (${mCount} rows, saldo actual=${mTotal}) ===`);
  console.log('  Últimos 10:');
  for (const r of (mLedger ?? []).slice(0, 10)) {
    console.log(`    ${r.created_at}  ${(r.amount as number).toString().padStart(5)}  kind=${r.kind} src=${r.source}  ${(r.description ?? '').slice(0,60)}`);
  }

  // 4) ops_ledger — sum vs recent rows
  const { data: oLedger, count: oCount } = await s.from('ops_ledger')
    .select('amount, kind, description, created_at', { count: 'exact' })
    .eq('portal_email', PORTAL)
    .order('created_at', { ascending: false });
  const oTotal = (oLedger ?? []).reduce((sum, r) => sum + (r.amount as number), 0);
  console.log(`\n=== ops_ledger (${oCount} rows, saldo actual=${oTotal}) ===`);
  console.log('  Últimos 15:');
  for (const r of (oLedger ?? []).slice(0, 15)) {
    console.log(`    ${r.created_at}  ${(r.amount as number).toString().padStart(5)}  kind=${r.kind}  ${(r.description ?? '').slice(0,60)}`);
  }

  // 5) organizations plan settings
  const { data: org } = await s.from('organizations')
    .select('portal_email, plan, minutes_plan, ops_included, ops_used, minutes_included, subscription_status, created_at')
    .eq('portal_email', PORTAL)
    .maybeSingle();
  console.log('\n=== organizations ===');
  console.log(' ', JSON.stringify(org, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
