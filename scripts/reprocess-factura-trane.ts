/**
 * Reprocesa el XML de la factura TRANE OC 6203 que ya está en Outlook,
 * invocando inv_procesar_factura_trane directo sin mandar correo nuevo.
 *
 * Pasos:
 *  1. Buscar la ops_inbox row del correo "Factura Trane para OC6203"
 *  2. Descargar el XML attachment desde Outlook via Graph API
 *  3. Invocar executeAgentTool con inv_procesar_factura_trane
 *  4. Reportar resultado (series matcheadas, filas actualizadas)
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { executeAgentTool } from '../src/lib/tools/executor';
import { createMicrosoft } from '../src/lib/connectors/microsoft';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const dryRunFlag = !process.argv.includes('--apply');
  console.log(`Mode: ${dryRunFlag ? 'DRY-RUN (pass --apply para escribir)' : 'APPLY (ESCRIBIRÁ al Excel real)'}`);

  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;
  if (!agentId) throw new Error('No encontré a Nami');

  // Buscar correo Factura TRANE más reciente
  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, raw_message_id, email_subject, attachments')
    .eq('agent_id', agentId)
    .ilike('email_subject', '%Factura Trane%')
    .not('email_from', 'ilike', '%notificaciones@centinelia%')
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (inbox?.[0] as any);
  if (!row) throw new Error('No encontré correo de Factura TRANE');
  console.log(`\nCorreo: ${row.email_subject}`);
  console.log(`  ops_inbox id: ${row.id}`);
  console.log(`  raw_message_id: ${row.raw_message_id?.slice(0, 60)}...`);

  const atts = (row.attachments ?? []) as Array<{ name: string; url: string; type: string; size: number }>;
  const xmlAtt = atts.find(a => /\.xml$/i.test(a.name));
  if (!xmlAtt) throw new Error('No encontré XML attachment');
  console.log(`  XML attachment: ${xmlAtt.name} (${Math.round(xmlAtt.size / 1024)}KB)`);

  // Extraer attachment ID del URL (formato: ms:${msgId}/${attId} o similar)
  // Mirar fetchAttachment pattern - usa messageId + attachmentId
  // El URL stored es `gmail:${msg.id}/${a.id}` por legacy name, para microsoft igual
  const urlMatch = xmlAtt.url.match(/^(?:gmail|ms|microsoft):([^/]+)\/(.+)$/);
  if (!urlMatch) {
    console.log(`  URL format unexpected: ${xmlAtt.url}`);
    // Fallback: use raw_message_id and search attachment by name via Graph
  }

  // Obtener token de Microsoft
  const { data: integ } = await sb.from('email_integrations').select('access_token')
    .eq('agent_id', agentId)
    .eq('provider', 'outlook')
    .maybeSingle();
  const token = (integ as any)?.access_token;
  if (!token) throw new Error('No token Outlook');

  // Buscar attachment via Graph: list all attachments of the message, find XML
  const msgId = row.raw_message_id;
  const listUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}/attachments?$select=id,name,contentType,size`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(`Graph list atts failed: ${listRes.status}`);
  const listData = await listRes.json();
  const xmlAttGraph = (listData.value ?? []).find((a: any) => /\.xml$/i.test(a.name));
  if (!xmlAttGraph) throw new Error('No XML attachment en Graph');
  console.log(`  Graph attachment id: ${xmlAttGraph.id.slice(0, 40)}...`);

  // Download attachment bytes
  const downUrl = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(xmlAttGraph.id)}/$value`;
  const downRes = await fetch(downUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!downRes.ok) throw new Error(`Download failed: ${downRes.status}`);
  const xmlBuffer = Buffer.from(await downRes.arrayBuffer());
  const xmlText = xmlBuffer.toString('utf8');
  console.log(`\nXML descargado: ${xmlText.length} chars`);
  console.log(`  Primeros 300 chars: ${xmlText.slice(0, 300)}`);

  // Resolver context completo para executeAgentTool
  const { data: agentFull } = await sb.from('voice_agents').select('*').eq('id', agentId).single();
  const org = (agentFull as any)?.organization_id
    ? (await sb.from('organizations').select('*').eq('id', (agentFull as any).organization_id).single()).data
    : null;

  // Invocar la tool directamente
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Invocando inv_procesar_factura_trane con dry_run=${dryRunFlag}, oc_ac=6203`);
  console.log('='.repeat(70));
  const result = await executeAgentTool('inv_procesar_factura_trane', {
    xml: xmlText,
    oc_ac: '6203',
    dry_run: dryRunFlag,
  }, {
    agentId,
    portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami',
    businessName: (org as any)?.business_name ?? 'AC Proyectos',
    portalToken: (agentFull as any)?.portal_token ?? '',
    agent: (agentFull as any) ?? {},
    supabase: sb as any,
    channel: 'email',
    userContext: 'Reprocesamiento manual de factura TRANE OC 6203 — forzado por operador',
  });

  console.log('\n--- RESULTADO ---');
  console.log(JSON.stringify(result, null, 2).slice(0, 3000));
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
