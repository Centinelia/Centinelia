import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Try common auth table names
  for (const table of ['oauth_tokens', 'ms_tokens', 'microsoft_tokens', 'graph_tokens', 'integration_tokens']) {
    const { data, error } = await sb.from(table).select('*').limit(1);
    if (!error && data) console.log(`TABLE ${table}: exists, sample len=${data.length}`);
  }
  // Try querying for AC specifically in known tables
  const { data: inboxes } = await sb
    .from('ops_inbox')
    .select('agent_id, created_at, source')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\nUltimos 10 ops_inbox para Nami (sources):');
  for (const r of inboxes ?? []) console.log(`  ${(r as any).created_at.slice(0, 19)}  source=${(r as any).source}`);
}
main().catch(e => { console.error(e); process.exit(1); });
