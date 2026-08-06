import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { getConnector } from '@/lib/connectors';
import { resolveAutoMode } from '@/lib/email/email-sync';

export async function resumeAgentAfterHumanResponse(requestId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from('human_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!request) { console.error('[resume] request not found', requestId); return; }

  const validStatuses = ['responded', 'cancelled', 'timeout'];
  if (!validStatuses.includes(request.status)) {
    console.warn('[resume] status not eligible', request.status);
    return;
  }

  if (request.source_channel !== 'email') {
    // Voice/chat resume queda para fase 2 (spec §5.8 no-goal MVP)
    console.log('[resume] source_channel', request.source_channel, 'not implemented in MVP');
    await supabase.from('human_requests').update({ resume_triggered_at: new Date().toISOString() }).eq('id', requestId);
    return;
  }

  if (!request.source_inbox_id) {
    console.error('[resume] email source without source_inbox_id', requestId);
    return;
  }

  // Fetch original inbox row + agent context
  const { data: inbox } = await supabase.from('ops_inbox').select('*').eq('id', request.source_inbox_id).single();
  if (!inbox) { console.error('[resume] source inbox not found', request.source_inbox_id); return; }

  const { data: agent } = await supabase.from('voice_agents').select('*').eq('id', request.agent_id).single();
  if (!agent) { console.error('[resume] agent not found', request.agent_id); return; }

  const { data: orgData } = agent.portal_email
    ? await supabase.from('organizations').select('knowledge_base, auto_mode_disabled_at').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };

  // Comparte helper con email-sync.ts para que el kill switch env se comporte igual
  // en el flujo de sync inicial y en el resume post-handoff.
  const orgDisabled = !!(orgData as Record<string, unknown> | null)?.auto_mode_disabled_at;
  const baseAutoMode = resolveAutoMode({
    trust_stage: (agent as Record<string, unknown>).trust_stage as number | null,
    orgDisabled,
  });

  // Cuando el humano YA respondió con info via pedir_a_humano, esa respuesta
  // ES el approval implícito. Forzar autoMode='always' para que el draft
  // resultante salga en ese momento y no requiera otra aprobación redundante
  // en la bandeja. Kill switches (orgDisabled) siguen respetándose.
  const autoMode = (request.status === 'responded' && !orgDisabled)
    ? 'always' as const
    : baseAutoMode;

  // Build sendReplyFn — fetch email integration for the agent so resumes can auto-send
  let sendReplyFn: ((body: string) => Promise<void>) | undefined;
  const { data: emailIntegration } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', request.agent_id)
    .maybeSingle();
  if (emailIntegration) {
    try {
      const conn = await getConnector(emailIntegration as Parameters<typeof getConnector>[0], supabase);
      sendReplyFn = (body: string) => conn.email.sendReply({
        messageId: inbox.raw_message_id as string ?? '',
        threadId:  inbox.thread_id   as string | undefined,
        to:        inbox.email_from  as string,
        subject:   inbox.email_subject as string ?? '',
        body,
      });
    } catch (err) {
      console.error('[resume] could not build sendReplyFn, degrading to pending:', err);
    }
  }

  // Build enriched context
  let humanBlock = '';
  if (request.status === 'responded') {
    humanBlock = `\n\n--- Info adicional del equipo humano ---\nSolicitud: ${request.title}\nRespuesta de ${request.target_email}:\n${request.response_text ?? '(sin texto)'}`;
    if (request.response_files && Array.isArray(request.response_files) && request.response_files.length > 0) {
      const filesList = (request.response_files as Array<{name: string; url: string}>).map(f => `- ${f.name}: ${f.url}`).join('\n');
      humanBlock += `\nArchivos adjuntos:\n${filesList}`;
    }
    if (request.response_action) humanBlock += `\nAcción confirmada: ${request.response_action}`;
  } else if (request.status === 'cancelled') {
    humanBlock = `\n\n--- El humano NO pudo ayudar ---\nSolicitud original: ${request.title}\nRazón: ${request.cancellation_reason ?? 'no puedo ayudar'}\nProcede con lo que tienes o cancela la respuesta al cliente.`;
  } else if (request.status === 'timeout') {
    humanBlock = `\n\n--- Timeout: sin respuesta en 7 días ---\nSolicitud original: ${request.title}\nEl humano ${request.target_email} no respondió. Procede con la mejor respuesta posible sin esa info, o marca al cliente que no pudimos ayudar.`;
  }

  const effectiveBody = `${inbox.email_body ?? ''}${humanBlock}`.slice(0, 20000);

  try {
    await processInboxEmail({
      agentId:            request.agent_id,
      source:             inbox.source ?? 'gmail',
      rawMessageId:       inbox.raw_message_id ?? undefined,
      threadId:           inbox.thread_id ?? undefined,
      emailFrom:          inbox.email_from,
      emailSubject:       inbox.email_subject ?? '',
      emailBody:          effectiveBody,
      attachments:        (inbox.attachments as Array<{name: string; url: string; type: string; size: number}>) ?? [],
      agentName:          (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:       agent.business_name as string,
      knowledgeBase:      (orgData?.knowledge_base as string | null) ?? null,
      roleKB:             agent.role_knowledge_base as string | null,
      agentRole:          agent.role as string | null,
      ownerEmail:         agent.client_email as string,
      portalToken:        agent.portal_token as string,
      portalEmail:        agent.portal_email as string | undefined,
      autoMode,
      approvalEmail:      (agent as Record<string, unknown>).approval_email as string | null | undefined,
      existingInboxId:    inbox.id,          // ← reutiliza row existente
      originalEmailBody:  inbox.email_body as string | undefined,
      sendReplyFn,
    });

    await supabase.from('human_requests').update({ resume_triggered_at: new Date().toISOString() }).eq('id', requestId);
  } catch (err) {
    console.error('[resume] processInboxEmail failed:', err);
    // Deja resume_triggered_at NULL; cron puede reintentar
  }
}
