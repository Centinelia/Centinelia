/**
 * F3 end-to-end: delegate a document generation task to Noah via Sofia's chat.
 * Sofia doesn't have crear_documento in her toolset (nia = receptionist), but
 * task-executor's DELEGATION_TOOLS does include it, so Noah (via delegar_tarea)
 * should be able to generate the doc when the cron runs.
 *
 * Verify:
 *  - Sofia calls delegate_task
 *  - agent_tasks row created
 *  - After manual cron run, ops_documents has a new row with a real PDF
 */
import { loadEnv } from './_env';
loadEnv();
import { battleChat } from './battle-chat';
import { createClient } from '@supabase/supabase-js';

const APP           = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const SOFIA_ID      = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PORTAL_EMAIL  = 'studio@pneumastudio.mx';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const beforeDocs = (await s.from('ops_documents').select('id', { count: 'exact', head: true }).eq('portal_email', PORTAL_EMAIL)).count ?? 0;
  console.log(`ops_documents rows before: ${beforeDocs}`);

  // 1. Ask Sofia to delegate the doc generation
  console.log('\n[1] Chat con Sofia — pide cotización simple\n');
  const t = await battleChat({
    agentId: SOFIA_ID,
    message: 'Delégale a Noah que genere una cotización rápida para el cliente Test Battle SA con estos 2 servicios: Diseño Shopify $30,000 y Configuración WhatsApp $15,000. Sin IVA. Cliente TestBattle SA. Vigencia 7 días. Es urgente, delégalo sin pedirle plan.',
  });
  console.log('\n\n---TEXT SUMMARY---\n', t.text.slice(0, 400));

  await new Promise(r => setTimeout(r, 3000));

  // 2. Find the created task
  const { data: task } = await s
    .from('agent_tasks')
    .select('id, title, status, plan, assigned_to')
    .eq('portal_email', PORTAL_EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  console.log('\n[2] Última tarea:', task);

  // 3. If awaiting plan, auto-approve; if pending, run cron
  if (task?.status === 'awaiting_plan_approval') {
    console.log('  → Plan pendiente. Auto-aprobando via SQL para acelerar test…');
    await s.from('agent_tasks').update({ status: 'pending', plan_approved_at: new Date().toISOString(), plan_approval_token: null }).eq('id', task.id);
  }

  const secret = process.env.CRON_SECRET!;
  console.log('\n[3] Trigger cron process-tasks…');
  const res = await fetch(`${APP}/api/cron/process-tasks`, { headers: { Authorization: `Bearer ${secret}` } });
  console.log('   cron:', res.status, await res.text());

  await new Promise(r => setTimeout(r, 4000));

  const { data: taskAfter } = await s.from('agent_tasks').select('status, result, completed_at').eq('id', task!.id).single();
  console.log('\n[4] Task after cron:', taskAfter);

  const afterDocs = (await s.from('ops_documents').select('id', { count: 'exact', head: true }).eq('portal_email', PORTAL_EMAIL)).count ?? 0;
  console.log(`\nops_documents rows after: ${afterDocs}`);

  if (afterDocs > beforeDocs) {
    const { data: doc } = await s
      .from('ops_documents')
      .select('id, kind, filename, file_url, client_name, total_amount, expiry_date')
      .eq('portal_email', PORTAL_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    console.log('\n[5] Documento creado:', doc);
    console.log(`   VERDE ✅ — se generó doc "${doc?.filename}" (kind=${doc?.kind})`);
  } else {
    console.log('\n🔴 No se creó ningún documento.');
  }
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
