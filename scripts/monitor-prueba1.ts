/**
 * Monitor en tiempo real de la Prueba 1: espera a que llegue un correo nuevo
 * al pipeline de Nami y reporta todo lo relevante.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;
  const startIso = new Date().toISOString();
  console.log(`Monitor arranca ${startIso}, agent ${agentId}\n`);

  const seenInbox = new Set<string>();
  const seenLlm = new Set<string>();
  const seenMut = new Set<string>();

  for (let i = 0; i < 60; i++) {  // 60 * 15s = 15 min total
    // ops_inbox nuevos desde arranque
    const { data: inbox } = await sb
      .from('ops_inbox')
      .select('id, created_at, email_from, email_subject, status, category, sent_at, ai_summary, ai_draft, attachments')
      .eq('agent_id', agentId)
      .gte('created_at', startIso)
      .order('created_at', { ascending: false });
    for (const r of inbox ?? []) {
      const row = r as any;
      if (seenInbox.has(row.id)) continue;
      seenInbox.add(row.id);
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🆕 OPS_INBOX nuevo @ ${row.created_at.slice(11, 19)}`);
      console.log(`   id: ${row.id}`);
      console.log(`   from: ${(row.email_from ?? '').slice(0, 55)}`);
      console.log(`   subj: ${(row.email_subject ?? '').slice(0, 80)}`);
      console.log(`   status: ${row.status}  cat: ${row.category}  sent_at: ${row.sent_at ?? 'no'}`);
      console.log(`   attachments: ${((row.attachments ?? []) as any[]).length}`);
      if (row.ai_summary) {
        console.log(`\n   AI_SUMMARY:\n     ${row.ai_summary.slice(0, 500)}`);
      }
      if (row.ai_draft) {
        console.log(`\n   AI_DRAFT (lo que respondería):\n     ${row.ai_draft.slice(0, 500)}`);
      }
    }

    // llm_call_log nuevos (incl. validator events!)
    const { data: logs } = await sb
      .from('llm_call_log')
      .select('created_at, source, latency_ms, meta, error')
      .eq('agent_id', agentId)
      .gte('created_at', startIso)
      .order('created_at', { ascending: false });
    for (const r of logs ?? []) {
      const row = r as any;
      const k = row.created_at + '|' + row.source;
      if (seenLlm.has(k)) continue;
      seenLlm.add(k);
      const metaStr = JSON.stringify(row.meta ?? {}).slice(0, 200);
      const icon = row.source.includes('validator') ? '🛡️' : row.source.includes('summary') ? '📊' : '🧠';
      console.log(`\n${icon} LLM ${row.created_at.slice(11, 19)}  src=${row.source}  latency=${row.latency_ms}ms`);
      console.log(`   meta: ${metaStr}`);
      if (row.error) console.log(`   ERROR: ${row.error.slice(0, 200)}`);
    }

    // inventory_mutations_log nuevos
    const { data: mut } = await sb
      .from('inventory_mutations_log')
      .select('created_at, tool_name, success, error_code, serie')
      .eq('agent_id', agentId)
      .gte('created_at', startIso)
      .order('created_at', { ascending: false });
    for (const r of mut ?? []) {
      const row = r as any;
      const k = row.created_at + '|' + row.tool_name;
      if (seenMut.has(k)) continue;
      seenMut.add(k);
      console.log(`\n⚙️  INV MUTATION ${row.created_at.slice(11, 19)}  ${row.tool_name}  success=${row.success}  serie=${row.serie ?? '-'}`);
    }

    process.stdout.write(`\r[tick ${i + 1}/60] seen: inbox=${seenInbox.size} llm=${seenLlm.size} mut=${seenMut.size}  `);
    await new Promise(r => setTimeout(r, 15000));  // 15s
  }
  console.log(`\n\nMonitor terminado. Total: inbox=${seenInbox.size} llm=${seenLlm.size} mut=${seenMut.size}`);
}
main().catch(e => { console.error(e); process.exit(1); });
