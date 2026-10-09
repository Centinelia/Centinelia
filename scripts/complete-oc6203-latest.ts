import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;
  const { data: org } = await sb.from('organizations').select('name').eq('portal_email', 'camila@acproyectos.com').single();
  const { data: row } = await sb.from('ops_inbox').select('attachments').eq('agent_id', a.id)
    .eq('created_at', '2026-10-08T17:50:53.996374+00:00').single();
  const xmlAtt = (row as any).attachments.find((x: any) => /\.xml$/i.test(x.name));
  const xmlRes = await fetch(xmlAtt.download_url);
  const xmlText = await xmlRes.text();
  const result = await executeAgentTool('inv_procesar_factura_trane', { xml: xmlText, oc_ac: '6203', dry_run: false }, {
    agentId: a.id, portalEmail: 'camila@acproyectos.com', agentName: 'Nami',
    businessName: (org as any)?.name ?? 'AC Proyectos', portalToken: a.portal_token ?? '',
    agent: a, supabase: sb as any, channel: 'email', userContext: 'complete factura',
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 500));
}
main().catch(e => { console.error(e); process.exit(1); });
