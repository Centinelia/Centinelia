/**
 * Reproceso directo de msg específico via processInboxEmail (con todos los
 * fixes nuevos: paginación, deduce download_url, descripcion, folio Serie+Folio).
 */
import './_bootstrap';
async function main() {
  const msgId = process.argv[2];
  if (!msgId) throw new Error('usage: tsx force-process-msg.ts <graph_msg_id>');

  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: integ } = await sb.from('email_integrations').select('access_token').eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344').eq('provider', 'outlook').maybeSingle();
  const token = (integ as any).access_token;

  // Fetch msg + attachments
  const msgRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}?$select=id,conversationId,subject,from,body,hasAttachments`, { headers: { Authorization: `Bearer ${token}` } });
  if (!msgRes.ok) throw new Error(`msg fetch ${msgRes.status}`);
  const msg = await msgRes.json();
  console.log('subject:', msg.subject, 'from:', msg.from?.emailAddress?.address);

  // Attachments con isInline filter + size filter (igual que connector)
  const attRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}/attachments`, { headers: { Authorization: `Bearer ${token}` } });
  const attData = await attRes.json();
  const attachments = (attData.value ?? []).filter((a: any) => {
    if (!a.isInline) return true;
    const mime = (a.contentType ?? '').toLowerCase();
    if (!mime.startsWith('image/')) return true;
    return (a.size ?? 0) > 5120;
  }).map((a: any) => ({ id: a.id, name: a.name ?? 'attachment', mimeType: a.contentType ?? 'application/octet-stream', size: a.size ?? 0 }));
  console.log('attachments:', attachments.map((a: any) => a.name));

  // Load agent
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;
  const { data: org } = await sb.from('organizations').select('knowledge_base, name').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  const o = (org ?? { knowledge_base: null, name: 'AC Proyectos' }) as any;

  // Simular connector + enrichWithAttachments
  const { getConnector } = await import('../src/lib/connectors');
  const { data: integRow } = await sb.from('email_integrations').select('*').eq('agent_id', a.id).eq('provider', 'outlook').single();
  const conn = await getConnector(integRow as any, sb as any);

  const { processIncomingAttachments } = await import('../src/lib/email/attachment-reader');
  const processed = await processIncomingAttachments(conn.email, msgId, attachments, { portalEmail: a.portal_email, subject: msg.subject });
  const stripHtml = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
  let body = stripHtml(msg.body?.content ?? '');
  if (processed.docTextBlocks.length) body += `\n\n--- Contenido de documentos adjuntos ---\n${processed.docTextBlocks.join('\n\n')}`;
  if (processed.skipped.length) body += `\n\n[Adjuntos no leídos: ${processed.skipped.join(', ')}]`;
  const metas = attachments.map((at: any) => ({ name: at.name, url: `gmail:${msgId}/${at.id}`, type: at.mimeType, size: at.size, download_url: processed.uploads.find(u => u.name === at.name)?.download_url }));
  if (processed.uploads.length) body += `\n\n[Adjuntos descargables (URL firmada 2h):\n${processed.uploads.map(u => `  • ${u.name} → ${u.download_url}`).join('\n')}]`;

  const { processInboxEmail } = await import('../src/lib/ops/inbox-processor');
  await processInboxEmail({
    agentId: a.id, source: 'outlook', rawMessageId: msgId, threadId: msg.conversationId,
    emailFrom: `${msg.from?.emailAddress?.name ?? ''} <${msg.from?.emailAddress?.address ?? ''}>`,
    emailSubject: msg.subject, emailBody: body, attachments: metas,
    attachmentImages: processed.images.length > 0 ? processed.images : undefined,
    agentName: 'Nami', businessName: o.name ?? 'AC Proyectos',
    knowledgeBase: o.knowledge_base ?? null, roleKB: a.role_knowledge_base ?? null,
    agentRole: a.role ?? null, ownerEmail: a.client_email ?? '',
    portalToken: a.portal_token ?? '', portalEmail: a.portal_email ?? undefined,
    autoMode: 'auto', approvalEmail: a.approval_email ?? null,
    sendReplyFn: (b: string) => conn.email.sendReply({ messageId: msgId, threadId: msg.conversationId, to: `<${msg.from?.emailAddress?.address}>`, subject: msg.subject, body: b }),
  });
  console.log('\n=== DONE ===');
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
