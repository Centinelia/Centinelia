import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  // Buscar el XML de la factura cliente en los correos recientes
  const { data: items } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, attachments')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .gte('created_at', '2026-10-09T16:40:00')
    .order('created_at', { ascending: false });
  let xmlUrl: string | null = null;
  for (const r of (items ?? []) as any[]) {
    const atts = (r.attachments ?? []) as Array<any>;
    const xmlAtt = atts.find(a => /AAP010601S21_23268A/i.test(a.name) && /\.xml$/i.test(a.name));
    if (xmlAtt?.download_url) {
      xmlUrl = xmlAtt.download_url;
      console.log(`found in ${r.email_subject}: ${xmlAtt.name}`);
      break;
    }
  }
  if (!xmlUrl) { console.log('No XML found'); return; }
  const res = await fetch(xmlUrl);
  if (!res.ok) { console.log('fetch failed'); return; }
  const xml = await res.text();
  console.log('XML length:', xml.length);
  console.log('XML preview:', xml.slice(0, 300));
  
  // Invocar el tool
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const result = await executeAgentTool('inv_procesar_factura_venta_sf', { xml }, {
    agentId: '3245bc1f-89e1-4949-bbed-71a18b05e344',
    portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami',
    businessName: 'AC Proyectos',
    portalToken: (agent as any).portal_token ?? '',
    agent: agent as any,
    supabase: sb as any,
    channel: 'email',
    userContext: 'manual script fix factura cliente',
  });
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2).slice(0, 1500));
}
main().catch(e => { console.error('ERR:', e); process.exit(1); });
