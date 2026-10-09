import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // 1. Email integration status
  const { data: integ } = await sb.from('email_integrations').select('last_sync_at, provider, email, status').eq('agent_id', agentId).maybeSingle();
  console.log('Integration:', integ);

  // 2. Todos los correos último 30 min
  const { data: inbox } = await sb
    .from('ops_inbox')
    .select('created_at, email_from, email_subject, status, category')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });
  console.log(`\nTodos los correos último 30 min (${inbox?.length ?? 0}):`);
  for (const r of inbox ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  from=${(row.email_from ?? '').slice(0, 45)}  subj=${(row.email_subject ?? '').slice(0, 50)}  status=${row.status}`);
  }

  // 3. Busca TEST, 99999, OC_TEST en TODO ops_inbox (sin filtro de tiempo)
  const { data: anyTest } = await sb
    .from('ops_inbox')
    .select('created_at, email_from, email_subject, status')
    .eq('agent_id', agentId)
    .or('email_subject.ilike.%TEST%,email_subject.ilike.%99999%,email_subject.ilike.%OC%')
    .gte('created_at', new Date(Date.now() - 3 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(`\nCorreos con TEST/99999/OC en subject (3h): ${anyTest?.length ?? 0}`);
  for (const r of anyTest ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(11, 19)}  from=${(row.email_from ?? '').slice(0, 40)}  subj=${(row.email_subject ?? '').slice(0, 70)}  status=${row.status}`);
  }

  // 4. ¿revisar_mi_inbox_ahora cron funcionó? Check cron logs via llm_call_log
  const { data: logs } = await sb
    .from('llm_call_log')
    .select('created_at, source, meta, error')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(15);
  console.log(`\nllm_call_log último 30 min (${logs?.length ?? 0}):`);
  for (const r of logs ?? []) {
    const row = r as any;
    const meta = JSON.stringify(row.meta ?? {}).slice(0, 150);
    console.log(`  ${row.created_at.slice(11, 19)}  src=${row.source}  meta=${meta}${row.error ? ' ERR=' + row.error.slice(0, 100) : ''}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
