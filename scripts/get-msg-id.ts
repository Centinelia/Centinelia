import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const token = (integ as any).access_token;
  // El msg nuevo "REGISTRAR OC 6203" from victoria 16:24
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=receivedDateTime gt 2026-10-08T16:20:00Z&$select=id,subject,from,receivedDateTime&$top=5&$orderby=receivedDateTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  for (const m of (data.value ?? []) as any[]) {
    if (/REGISTRAR OC/i.test(m.subject)) {
      console.log(m.id);
      return;
    }
  }
  console.log('NO FOUND');
}
main().catch(e => { console.error(e); process.exit(1); });
