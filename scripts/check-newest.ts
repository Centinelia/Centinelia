import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('access_token, last_sync_at').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  console.log('last_sync_at:', (integ as any).last_sync_at);
  const token = (integ as any).access_token;
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=receivedDateTime gt 2026-10-08T18:30:00Z&$select=id,subject,hasAttachments&$top=5&$orderby=receivedDateTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  for (const m of (data.value ?? []) as any[]) {
    console.log(`"${m.subject}" id=${m.id.slice(0, 50)}`);
    const { data: existing } = await sb.from('ops_inbox').select('id, status').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('raw_message_id', m.id).maybeSingle();
    console.log(`  in ops_inbox: ${existing ? JSON.stringify(existing) : 'NO'}`);
    const { data: ledger } = await sb.from('ai_ops_log').select('count, created_at').eq('portal_email', 'camila@acproyectos.com').eq('reference_id', `${m.id}:processed`).limit(2);
    console.log(`  ledger entries: ${(ledger ?? []).map((l: any) => `[${l.created_at.slice(11,23)}] count=${l.count}`).join(', ')}`);
  }
}
main().catch(e => console.error(e));
