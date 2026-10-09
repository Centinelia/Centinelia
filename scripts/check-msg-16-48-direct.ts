import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { createMicrosoftConnector } = await import('../src/lib/connectors/microsoft');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const token = (integ as any).access_token;

  // Row del 16:48
  const { data: row } = await sb.from('ops_inbox').select('raw_message_id, email_subject')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .eq('created_at', '2026-10-08T16:48:16.673135+00:00').single();
  const msgId = (row as any).raw_message_id;
  console.log('msg id:', msgId.slice(0, 50));

  // Raw de Graph
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}/attachments`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  console.log('\n=== Graph RAW ===');
  for (const a of (data.value ?? []) as any[]) {
    console.log(`${a.name} | ${a.contentType} | ${a.size}B | isInline=${a.isInline}`);
    console.log(`  pasa filtro? ${!a.isInline || !(a.contentType ?? '').toLowerCase().startsWith('image/') || (a.size ?? 0) > 5120}`);
  }

  // Via connector
  const conn = createMicrosoftConnector(token);
  const msgs = await conn.email.fetchUnread(new Date(Date.now() - 60 * 60 * 1000));
  const match = msgs.find(m => m.id === msgId);
  console.log('\n=== Via connector fetchUnread ===');
  console.log(match ? `attachments count: ${match.attachments?.length ?? 0}` : 'NOT in fetchUnread result');
  if (match) {
    for (const a of (match.attachments ?? [])) {
      console.log(`  ${a.name} ${a.mimeType} ${a.size}B`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
