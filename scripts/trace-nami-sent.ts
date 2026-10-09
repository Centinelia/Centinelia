import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  // Los 2 correos que respondió
  const { data: items } = await sb
    .from('ops_inbox')
    .select('*')
    .eq('agent_id', agentId)
    .not('sent_at', 'is', null)
    .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false });

  for (const r of items ?? []) {
    const row = r as any;
    console.log(`\n${'='.repeat(80)}\nCORREO ID: ${row.id}`);
    console.log(`  recibido: ${row.created_at}  respondido: ${row.sent_at}`);
    console.log(`  from: ${row.email_from}`);
    console.log(`  subj: ${row.email_subject}`);
    console.log(`  status: ${row.status}  cat: ${row.category}`);
    console.log(`  attachments: ${JSON.stringify((row.attachments ?? []).map((a: any) => a.name)).slice(0, 150)}`);
    console.log(`\n  AI_SUMMARY (lo que Nami pensó):\n    ${(row.ai_summary ?? '').slice(0, 500)}`);
    console.log(`\n  AI_DRAFT (lo que Nami respondió):\n    ${(row.ai_draft ?? '').slice(0, 500)}`);

    // Buscar llm_call_log para este raw_message_id
    const refStart = `${row.id}%`;
    const refStart2 = `${row.raw_message_id}%`;
    const { data: logs } = await sb
      .from('llm_call_log')
      .select('created_at, source, latency_ms, meta')
      .eq('agent_id', agentId)
      .or(`meta->>reference_id.like.${refStart},meta->>raw_message_id.like.${refStart2}`)
      .limit(10);
    console.log(`\n  LLM calls relacionadas: ${logs?.length ?? 0}`);
    for (const l of logs ?? []) {
      console.log(`    ${(l as any).created_at.slice(11, 19)}  ${(l as any).source}  ${(l as any).latency_ms}ms  meta=${JSON.stringify((l as any).meta).slice(0, 200)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
