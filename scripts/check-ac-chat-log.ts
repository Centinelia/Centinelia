import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // chats recientes
  const { data: ops } = await sb
    .from('ai_ops_log')
    .select('created_at, kind, count, source, reference_id, metadata')
    .eq('portal_email', 'camila@acproyectos.com')
    .eq('source', 'agent_chat')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(`agent_chat ops last 1h: ${ops?.length ?? 0}`);
  for (const r of ops ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  count=${row.count}  ref=${(row.reference_id ?? '').slice(0, 40)}`);
    if (row.metadata) console.log(`    meta: ${JSON.stringify(row.metadata).slice(0, 200)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
