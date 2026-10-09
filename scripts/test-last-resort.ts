/**
 * Test manual del last-resort invocation. Simula un correo "RE:" con
 * factura TRANE adjunta usando los datos reales del msg 16:42 pero con
 * rawMessageId ficticio para evitar dedup. Dispara processInboxEmail
 * directo y verifica los logs llm_call_log del last-resort check/deduce.
 *
 * Si el fix funciona: Nami invoca inv_procesar_factura_trane via last-resort
 * (porque modelo rebelde con RE:) → tools_invoked incluye factura_trane →
 * ai_draft generado.
 *
 * Si falla: los logs nuevos nos dirán EXACTAMENTE dónde:
 *   - last_resort_check.would_invoke: ¿se evaluó?
 *   - last_resort_deduce.deducedArgs_null: ¿fetch del XML falló?
 */
import './_bootstrap';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { getConnector } = await import('../src/lib/connectors');
  const { processIncomingAttachments } = await import('../src/lib/email/attachment-reader');
  const { processInboxEmail } = await import('../src/lib/ops/inbox-processor');
  const sb = createAdminClient();

  const AGENT_ID = '3245bc1f-89e1-4949-bbed-71a18b05e344';
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', AGENT_ID).single();
  const a = agent as any;
  const { data: org } = await sb.from('organizations').select('name, knowledge_base').eq('portal_email', 'camila@acproyectos.com').single();
  const o = org as any;

  // Reutilizar el msg real del 16:42 para los attachments
  const { data: realRow } = await sb.from('ops_inbox').select('raw_message_id, attachments')
    .eq('agent_id', AGENT_ID)
    .gte('created_at', '2026-10-08T16:42:00Z').lte('created_at', '2026-10-08T16:43:00Z')
    .ilike('email_subject', 'RE: REGISTRAR OC 6203').single();
  const realMsgId = (realRow as any).raw_message_id;

  // Download attachments vía connector (igual que el poll real)
  const { data: integRow } = await sb.from('email_integrations').select('*').eq('agent_id', AGENT_ID).eq('provider', 'outlook').single();
  const conn = await getConnector(integRow as any, sb as any);

  // Fetch attachments metadata (vía API Graph directo porque el msg real existe)
  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', AGENT_ID).eq('provider', 'outlook').maybeSingle();
  const token = (integ as any).access_token;
  const attRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(realMsgId)}/attachments`, { headers: { Authorization: `Bearer ${token}` } });
  const attData = await attRes.json();
  const attachments = (attData.value ?? []).filter((at: any) => {
    if (!at.isInline) return true;
    const mime = (at.contentType ?? '').toLowerCase();
    if (!mime.startsWith('image/')) return true;
    return (at.size ?? 0) > 5120;
  }).map((at: any) => ({ id: at.id, name: at.name ?? 'attachment', mimeType: at.contentType ?? 'application/octet-stream', size: at.size ?? 0 }));
  console.log(`attachments: ${attachments.length}`, attachments.map((at: any) => at.name));

  // Simular enrichWithAttachments
  const processed = await processIncomingAttachments(conn.email, realMsgId, attachments, { portalEmail: a.portal_email, subject: 'RE: REGISTRAR OC 6203' });
  const metas = attachments.map((at: any) => ({
    name: at.name, url: `gmail:${realMsgId}/${at.id}`, type: at.mimeType, size: at.size,
    download_url: processed.uploads.find(u => u.name === at.name)?.download_url,
  }));
  let body = 'Hola Nami, aqui te mando la factura de trane. Camila';
  if (processed.docTextBlocks.length) body += `\n\n--- Contenido de documentos adjuntos ---\n${processed.docTextBlocks.join('\n\n')}`;
  if (processed.uploads.length) body += `\n\n[Adjuntos descargables (URL firmada 2h):\n${processed.uploads.map(u => `  • ${u.name} → ${u.download_url}`).join('\n')}]`;

  // RAW ID ficticio para evitar dedup
  const TEST_MSG_ID = `test-last-resort-${Date.now()}`;
  console.log('\n=== Invocando processInboxEmail con rawMessageId ficticio ===');
  console.log('TEST_MSG_ID:', TEST_MSG_ID);

  await processInboxEmail({
    agentId: a.id, source: 'outlook',
    rawMessageId: TEST_MSG_ID,
    threadId: 'test-thread-' + Date.now(),
    emailFrom: 'Camila Rodarte Dominguez <camila@acproyectos.com>',
    emailSubject: 'RE: REGISTRAR OC 6203',
    emailBody: body, attachments: metas,
    attachmentImages: processed.images.length > 0 ? processed.images : undefined,
    agentName: 'Nami', businessName: o.name ?? 'AC Proyectos',
    knowledgeBase: o.knowledge_base ?? null, roleKB: a.role_knowledge_base ?? null,
    agentRole: a.role ?? null, ownerEmail: a.client_email ?? '',
    portalToken: a.portal_token ?? '', portalEmail: a.portal_email ?? undefined,
    autoMode: 'auto', approvalEmail: a.approval_email ?? null,
    sendReplyFn: async (b: string) => { console.log('\n>>> MOCK SEND REPLY (not actually sent):\n', b.slice(0, 300)); },
  });

  // Esperar 2s para que lleguen los logs a Supabase
  await new Promise(r => setTimeout(r, 2000));

  // Capturar logs
  console.log('\n=== LOGS ===');
  const { data: logs } = await sb.from('llm_call_log')
    .select('created_at, source, meta')
    .eq('agent_id', AGENT_ID)
    .gte('created_at', new Date(Date.now() - 60000).toISOString())
    .order('created_at');
  for (const l of (logs ?? []) as any[]) {
    console.log(`[${l.created_at.slice(11, 23)}] ${l.source}`);
    console.log('  ' + JSON.stringify(l.meta ?? {}).slice(0, 300));
  }
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
