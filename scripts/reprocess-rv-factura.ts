import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();

  const { data: agent } = await sb.from('voice_agents').select('*')
    .eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').single();
  const a = agent as any;
  const org = a.organization_id ? (await sb.from('organizations').select('*').eq('id', a.organization_id).single()).data : null;

  const { data: row } = await sb.from('ops_inbox').select('id, raw_message_id, email_subject, attachments')
    .eq('id', 'a4b7e9a8-6984-4176-bcb9-59e1d10afefd').single();
  const r = row as any;
  console.log(`Correo: ${r.email_subject}`);

  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', a.id).eq('provider', 'outlook').maybeSingle();
  const token = (integ as any).access_token;
  const list = await (await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(r.raw_message_id)}/attachments`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const xmlAtt = list.value?.find((x: any) => /\.xml$/i.test(x.name));
  const dl = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(r.raw_message_id)}/attachments/${encodeURIComponent(xmlAtt.id)}/$value`, { headers: { Authorization: `Bearer ${token}` } });
  const xmlText = Buffer.from(await dl.arrayBuffer()).toString('utf8');
  console.log(`XML: ${xmlText.length} chars`);

  const result = await executeAgentTool('inv_procesar_factura_trane', { xml: xmlText, oc_ac: '6203', dry_run: false }, {
    agentId: a.id, portalEmail: 'camila@acproyectos.com', agentName: 'Nami',
    businessName: (org as any)?.business_name ?? 'AC Proyectos', portalToken: a.portal_token ?? '',
    agent: a, supabase: sb as any, channel: 'email', userContext: 'Reproceso RV',
  });
  console.log('\nRESULT:', JSON.stringify(result, null, 2).slice(0, 1500));
}
main().catch(e => { console.error(e); process.exit(1); });
