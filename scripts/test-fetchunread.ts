import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { createMicrosoftConnector } = await import('../src/lib/connectors/microsoft');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const conn = createMicrosoftConnector((integ as any).access_token);
  // Fetch unread from last 30 min
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const msgs = await conn.email.fetchUnread(since);
  console.log(`msgs count: ${msgs.length}`);
  for (const m of msgs) {
    if (!/REGISTRAR OC/i.test(m.subject)) continue;
    console.log(`\n[${m.subject}]`);
    console.log(`  id: ${m.id.slice(0, 50)}`);
    console.log(`  attachments count: ${m.attachments?.length ?? 0}`);
    for (const a of (m.attachments ?? [])) {
      console.log(`    - ${a.name} (${a.mimeType}, ${a.size}B)`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
