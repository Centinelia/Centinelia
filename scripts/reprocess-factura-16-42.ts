import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();

  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;
  const { data: org } = await sb.from('organizations').select('name').eq('portal_email', 'camila@acproyectos.com').single();

  const { data: row } = await sb.from('ops_inbox').select('attachments')
    .eq('agent_id', a.id)
    .gte('created_at', '2026-10-08T16:42:00Z').lte('created_at', '2026-10-08T16:43:00Z')
    .ilike('email_subject', 'RE: REGISTRAR OC 6203').single();
  const xmlAtt = (row as any).attachments.find((x: any) => /\.xml$/i.test(x.name));
  console.log('XML url:', xmlAtt?.download_url);

  const xmlRes = await fetch(xmlAtt.download_url);
  const xmlText = await xmlRes.text();
  console.log('XML len:', xmlText.length);

  const result = await executeAgentTool('inv_procesar_factura_trane', {
    xml: xmlText, oc_ac: '6203', dry_run: false,
  }, {
    agentId: a.id, portalEmail: 'camila@acproyectos.com', agentName: 'Nami',
    businessName: (org as any)?.name ?? 'AC Proyectos', portalToken: a.portal_token ?? '',
    agent: a, supabase: sb as any, channel: 'email', userContext: 'reproceso factura 16:42',
  });
  console.log('\n', JSON.stringify(result, null, 2).slice(0, 800));
}
main().catch(e => { console.error(e); process.exit(1); });
