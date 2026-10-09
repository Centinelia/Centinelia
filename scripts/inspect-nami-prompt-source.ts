import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const PORTAL_EMAIL = 'camila@acproyectos.com';

async function main() {
  const { data: agents } = await sb
    .from('voice_agents')
    .select('id, agent_name, ai_ops_used, ai_ops_limit, minutes_used, minutes_included, active, features')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('AGENTS:', JSON.stringify(agents, null, 2));

  const { data: org } = await sb
    .from('organizations')
    .select('name, monthly_ops_pool, monthly_ops_used, ops_ledger_enabled, plan')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('ORG:', JSON.stringify(org, null, 2));

  const { data: acctOps } = await sb
    .from('account_ops')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('ACCT_OPS:', JSON.stringify(acctOps, null, 2));

  const { data: acctMins } = await sb
    .from('account_minutes')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL);
  console.log('ACCT_MINS:', JSON.stringify(acctMins, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
