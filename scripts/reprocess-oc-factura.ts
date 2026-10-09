import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();

  const { data: agent } = await sb.from('voice_agents').select('*').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').single();
  const a = agent as any;
  const org = a.organization_id ? (await sb.from('organizations').select('*').eq('portal_email', 'camila@acproyectos.com').single()).data : null;

  const { data: row } = await sb.from('ops_inbox').select('*').eq('id', '595d7bd9-15f6-479e-9f5c-ec1b5929bcc0').single();
  const r = row as any;
  console.log('Correo:', r.email_subject);
  console.log('attachments:', r.attachments.map((x: any) => x.name));

  const ctx = { agentId: a.id, portalEmail: 'camila@acproyectos.com', agentName: 'Nami',
    businessName: (org as any)?.business_name ?? 'AC Proyectos', portalToken: a.portal_token ?? '',
    agent: a, supabase: sb as any, channel: 'email' as const, userContext: 'Reproceso manual OC+Factura' };

  const pdfOC = r.attachments.find((x: any) => /oc\s*6203/i.test(x.name));
  const xmlFac = r.attachments.find((x: any) => /\.xml$/i.test(x.name));
  console.log('\nPDF OC URL:', pdfOC?.download_url ? 'YES' : 'NO');
  console.log('XML Factura URL:', xmlFac?.download_url ? 'YES' : 'NO');

  // Step 1: OC
  console.log('\n=== STEP 1: inv_procesar_oc_qb ===');
  const r1 = await executeAgentTool('inv_procesar_oc_qb', {
    pdf_url: pdfOC.download_url, oc_ac: '6203', dry_run: false,
  }, ctx);
  console.log(JSON.stringify(r1, null, 2).slice(0, 800));

  // Step 2: factura (fetchea XML directo)
  console.log('\n=== STEP 2: inv_procesar_factura_trane ===');
  const xmlRes = await fetch(xmlFac.download_url);
  const xmlText = await xmlRes.text();
  console.log('XML len:', xmlText.length);
  const r2 = await executeAgentTool('inv_procesar_factura_trane', {
    xml: xmlText, oc_ac: '6203', dry_run: false,
  }, ctx);
  console.log(JSON.stringify(r2, null, 2).slice(0, 1000));
}
main().catch(e => { console.error(e); process.exit(1); });
