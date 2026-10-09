import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: row } = await sb.from('ops_inbox').select('raw_message_id')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .eq('created_at', '2026-10-08T18:13:36.915196+00:00').single();
  const msgId = (row as any).raw_message_id;
  const refId = `${msgId}:processed`;
  console.log('EXACT ref_id:', refId.slice(0, 100));
  const { data: exact } = await sb.from('ai_ops_log').select('created_at, count, source, reason, context')
    .eq('portal_email', 'camila@acproyectos.com')
    .eq('reference_id', refId);
  console.log('\nEXACT match entries:', exact?.length);
  for (const l of (exact ?? []) as any[]) console.log(` [${l.created_at.slice(11, 23)}] count=${l.count} source=${l.source} ctx=${JSON.stringify(l.context ?? {}).slice(0, 300)}`);
}
main().catch(e => console.error(e));
