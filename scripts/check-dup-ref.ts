import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: row } = await sb.from('ops_inbox').select('raw_message_id')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .eq('created_at', '2026-10-08T18:13:36.915196+00:00').single();
  const msgId = (row as any).raw_message_id;
  console.log('msg_id:', msgId.slice(0, 60));
  console.log('ref_id esperado:', msgId.slice(0, 60) + ':processed');

  // Query ledger si ya existe este ref_id
  const { data: ledger } = await sb.from('ai_ops_log').select('created_at, count, reference_id, source, reason')
    .eq('portal_email', 'camila@acproyectos.com')
    .ilike('reference_id', `${msgId}%`);
  console.log('\nledger entries para este msg:');
  for (const l of (ledger ?? []) as any[]) console.log(` [${l.created_at.slice(11, 23)}] count=${l.count} ref=${l.reference_id?.slice(0, 70)}`);
}
main().catch(e => console.error(e));
