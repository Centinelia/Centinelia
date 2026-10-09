/**
 * Monitor rápido del último correo procesado por Nami.
 */
import './_bootstrap';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();

  const { data: agents, error: aErr } = await sb.from('voice_agents')
    .select('id, portal_email, agent_name')
    .eq('portal_email', 'camila@acproyectos.com')
    .eq('agent_name', 'Nami');
  if (aErr) { console.error('AGENT ERR', aErr); process.exit(1); }
  console.log(`Agents found: ${agents?.length ?? 0}`);
  console.log(JSON.stringify(agents, null, 2));
  const agentId = (agents?.[0] as any)?.id;
  if (!agentId) throw new Error('No Nami');
  console.log(`\nUsing agentId: ${agentId}`);

  const { data: inbox, error: iErr } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, email_from, status, category, raw_message_id, attachments')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (iErr) { console.error('INBOX ERR', iErr); process.exit(1); }
  console.log(`\n=== ÚLTIMOS 5 CORREOS (TODOS) ===`);
  console.log(`count: ${inbox?.length ?? 0}`);
  for (const r of (inbox ?? [])) {
    const row = r as any;
    const atts = (row.attachments ?? []) as Array<{ name: string }>;
    console.log(`\n[${row.created_at}] ${row.email_subject}`);
    console.log(`  from: ${row.email_from}`);
    console.log(`  id: ${row.id}`);
    console.log(`  status: ${row.status}  category: ${row.category}  action: ${row.action}`);
    console.log(`  attachments: ${atts.map(a => a.name).join(', ') || '(ninguno)'}`);
  }
}
main().catch(e => { console.error('MAIN ERR', e); process.exit(1); });
