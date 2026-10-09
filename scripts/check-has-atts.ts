import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: row } = await sb.from('ops_inbox').select('raw_message_id')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .eq('created_at', '2026-10-08T16:48:16.673135+00:00').single();
  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const msgId = (row as any).raw_message_id;
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}?$select=id,subject,hasAttachments`, { headers: { Authorization: `Bearer ${(integ as any).access_token}` } });
  const data = await res.json();
  console.log('subject:', data.subject);
  console.log('hasAttachments:', data.hasAttachments);
}
main().catch(e => console.error(e));
