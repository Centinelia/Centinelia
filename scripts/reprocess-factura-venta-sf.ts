/**
 * Reprocesa la factura venta SF al cliente final para OC 6203.
 * Baja el XML del attachment del correo e invoca inv_procesar_factura_venta_sf.
 */
import './_bootstrap';

async function main() {
  const dryRun = !process.argv.includes('--apply');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY (ESCRIBIRÁ al Excel)'}`);

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();

  const { data: agents } = await sb.from('voice_agents').select('*')
    .eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agent = (agents?.[0] as any);
  if (!agent) throw new Error('No Nami');
  const org = agent.organization_id
    ? (await sb.from('organizations').select('*').eq('id', agent.organization_id).single()).data
    : null;

  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, raw_message_id, email_subject, attachments')
    .eq('agent_id', agent.id)
    .ilike('email_subject', '%Factura a Cliente%')
    .not('email_from', 'ilike', '%notificaciones@centinelia%')
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (inbox?.[0] as any);
  if (!row) throw new Error('No encontré correo de Factura a Cliente');
  console.log(`\nCorreo: ${row.email_subject}`);
  console.log(`  ops_inbox id: ${row.id}`);

  const { data: integ } = await sb.from('email_integrations').select('access_token')
    .eq('agent_id', agent.id).eq('provider', 'outlook').maybeSingle();
  const token = (integ as any)?.access_token;
  if (!token) throw new Error('No token Outlook');

  const listUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(row.raw_message_id)}/attachments`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(`Graph list atts failed: ${listRes.status}`);
  const listData = await listRes.json();
  const xmlAtt = (listData.value ?? []).find((a: any) => /\.xml$/i.test(a.name));
  if (!xmlAtt) {
    console.log('Attachments:', JSON.stringify(listData.value?.map((a: any) => ({ name: a.name, type: a.contentType, inline: a.isInline, size: a.size })), null, 2));
    throw new Error('No XML attachment en Graph');
  }
  console.log(`  XML: ${xmlAtt.name} (${Math.round(xmlAtt.size / 1024)}KB)`);

  const downUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(row.raw_message_id)}/attachments/${encodeURIComponent(xmlAtt.id)}/$value`;
  const downRes = await fetch(downUrl, { headers: { Authorization: `Bearer ${token}` } });
  const xmlText = Buffer.from(await downRes.arrayBuffer()).toString('utf8');
  console.log(`\nXML: ${xmlText.length} chars`);
  console.log(`  Preview: ${xmlText.slice(0, 300)}`);

  if (dryRun) { console.log('\n*** DRY-RUN: pasa --apply para escribir ***'); return; }

  console.log('\nInvocando inv_procesar_factura_venta_sf...');
  const result = await executeAgentTool('inv_procesar_factura_venta_sf', {
    xml: xmlText,
  }, {
    agentId:      agent.id,
    portalEmail:  'camila@acproyectos.com',
    agentName:    'Nami',
    businessName: (org as any)?.business_name ?? 'AC Proyectos',
    portalToken:  agent.portal_token ?? '',
    agent,
    supabase: sb as any,
    channel: 'email',
    userContext: 'Reprocesamiento manual de factura venta SF OC 6203',
  });

  console.log('\n--- RESULTADO ---');
  console.log(JSON.stringify(result, null, 2).slice(0, 3000));
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
