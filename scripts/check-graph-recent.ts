import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('access_token')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const token = (integ as any).access_token;
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$top=10&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,hasAttachments`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  for (const m of (data.value ?? []) as any[]) {
    console.log(`[${m.receivedDateTime}] "${m.subject}" from ${m.from?.emailAddress?.address} attachments=${m.hasAttachments}`);
  }
}
main().catch(e => console.error(e));
