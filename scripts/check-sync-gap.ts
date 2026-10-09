import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('last_sync_at, access_token')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const i = integ as any;
  console.log('last_sync_at:', i.last_sync_at);

  const since = i.last_sync_at;
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=receivedDateTime gt ${since}&$select=id,subject,receivedDateTime,from&$top=30&$orderby=receivedDateTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${i.access_token}` } });
  const data = await res.json();
  console.log(`\n=== msgs en Graph después de ${since} ===`);
  for (const m of (data.value ?? []) as any[]) {
    const inInbox = await sb.from('ops_inbox').select('id').eq('raw_message_id', m.id).maybeSingle();
    console.log(`[${m.receivedDateTime}] "${m.subject}" from=${m.from?.emailAddress?.address} inbox=${inInbox.data ? 'YES' : 'NO'}`);
  }
}
main().catch(e => console.error(e));
