import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // Last email sync
  const { data: integ } = await sb.from('email_integrations').select('last_sync_at, provider, email').eq('agent_id', agentId).maybeSingle();
  console.log('Email integration:', integ);

  // Last 3 ops_inbox entries
  const { data: inbox } = await sb.from('ops_inbox').select('created_at, email_from, email_subject, status').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(3);
  console.log(`\nLast 3 ops_inbox entries:`);
  for (const r of inbox ?? []) console.log(`  ${(r as any).created_at.slice(0, 19)}  from=${(r as any).email_from?.slice(0, 40)}  status=${(r as any).status}`);

  // Pool
  const { data: pool } = await sb.from('account_ops').select('ops_balance').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  console.log(`\nPool balance: ${(pool as any)?.ops_balance}`);
}
main().catch(e => { console.error(e); process.exit(1); });
