import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const inboxId = process.argv[2];
  if (!inboxId) throw new Error('usage: tsx inspect-graph-attachments.ts <inbox_id>');
  const { data: row } = await sb.from('ops_inbox').select('agent_id, raw_message_id, email_subject').eq('id', inboxId).single();
  const r = row as any;
  console.log('subject:', r.email_subject);
  console.log('msg_id:', r.raw_message_id?.slice(0, 60), '...');

  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', r.agent_id).eq('provider', 'outlook').maybeSingle();
  const token = (integ as any)?.access_token;
  if (!token) throw new Error('No token');

  const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(r.raw_message_id)}/attachments`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log('status:', res.status);
  const data = await res.json();
  console.log('\nATTACHMENTS en Graph:');
  console.log(JSON.stringify(data, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
