import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { getConnector } from '@/lib/connectors';
import { resolveAutoMode } from '@/lib/email/email-sync';
import { parseFileToText } from '@/lib/connectors/parse';

const SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedImageMime = typeof SUPPORTED_IMAGE_MIMES[number];

interface HumanResponseFile { name: string; url: string; mime_type?: string; size?: number }

async function processHumanAttachments(
  files: HumanResponseFile[],
): Promise<{ docTextBlocks: string[]; images: Array<{ name: string; base64: string; mimeType: SupportedImageMime }> }> {
  const docTextBlocks: string[] = [];
  const images: Array<{ name: string; base64: string; mimeType: SupportedImageMime }> = [];

  await Promise.all(files.map(async (f) => {
    try {
      const res = await fetch(f.url);
      if (!res.ok) {
        docTextBlocks.push(`[No pude descargar ${f.name}: HTTP ${res.status}]`);
        return;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const mime = (f.mime_type ?? res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();

      if (SUPPORTED_IMAGE_MIMES.includes(mime as SupportedImageMime)) {
        images.push({ name: f.name, base64: buffer.toString('base64'), mimeType: mime as SupportedImageMime });
        return;
      }

      // Docs (PDF/DOCX/XLSX/TXT/CSV/JSON) → texto plano
      const text = await parseFileToText(buffer, mime);
      const truncated = text.length > 5000 ? text.slice(0, 5000) + '\n[...truncado a 5000 chars]' : text;
      docTextBlocks.push(`### Archivo: ${f.name}\n${truncated}`);
    } catch (err) {
      docTextBlocks.push(`[Error leyendo ${f.name}: ${err instanceof Error ? err.message : String(err)}]`);
    }
  }));

  return { docTextBlocks, images };
}

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

  // Build sendReplyFn — para SEND prioriza per-agent (identidad del empleado)
  // y solo cae a per-org (integration_accounts) si el agente no tiene su propia
  // conexión. Es lo opuesto a /api/cron/learn donde per-org es fuente de verdad
  // del aprendizaje. Aquí es identidad del remitente.
  let sendReplyFn: ((body: string) => Promise<void>) | undefined;

  type IntegrationRow = Parameters<typeof getConnector>[0];
  let integration: IntegrationRow | null = null;

  const { data: perAgent } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', request.agent_id)
    .eq('needs_reauth', false)
    .maybeSingle();
  if (perAgent) integration = perAgent as IntegrationRow;

  if (!integration && agent.portal_email) {
    const { data: orgAcct } = await supabase
      .from('integration_accounts')
      .select('provider, account_label, access_token, refresh_token, expires_at, status')
      .eq('portal_email', agent.portal_email as string)
      .in('provider', ['gmail', 'outlook'])
      .maybeSingle();
    if (orgAcct && (orgAcct as Record<string, unknown>).status !== 'needs_reauth') {
      const o = orgAcct as Record<string, unknown>;
      integration = {
        id:                 `org:${agent.portal_email}:${o.provider}`,
        agent_id:           request.agent_id,
        provider:           o.provider as 'gmail' | 'outlook',
        email:              (o.account_label as string | null) ?? '',
        access_token:       (o.access_token as string | null) ?? '',
        refresh_token:      (o.refresh_token as string | null) ?? null,
        token_expires_at:   (o.expires_at as string | null) ?? null,
        last_sync_at:       null,
        needs_reauth:       false,
        reauth_notified_at: null,
      } as unknown as IntegrationRow;
    }
  }

  if (integration) {
    try {
      const conn = await getConnector(integration, supabase);
      const agentDisplayName = ((agent.agent_name as string | null)?.trim()) || null;
      const businessDisplayName = ((agent.business_name as string | null)?.trim()) || null;
      const fromDisplay = agentDisplayName
        ? (businessDisplayName ? `${agentDisplayName} - ${businessDisplayName}` : agentDisplayName)
        : undefined;
      sendReplyFn = (body: string) => conn.email.sendReply({
        messageId: inbox.raw_message_id as string ?? '',
        threadId:  inbox.thread_id   as string | undefined,
        to:        inbox.email_from  as string,
        subject:   inbox.email_subject as string ?? '',
        body,
        fromDisplay,
      });
    } catch (err) {
      console.error('[resume] could not build sendReplyFn, degrading to pending:', err);
    }
  }

  // Build enriched context — descarga y procesa adjuntos del humano.
  // Docs (PDF/DOCX/XLSX/TXT) → texto en humanBlock. Imágenes → base64 para
  // pasar como multimodal a Claude vision.
  let humanBlock = '';
  let humanImages: Array<{ name: string; base64: string; mimeType: SupportedImageMime }> = [];

  if (request.status === 'responded') {
    humanBlock = `\n\n--- Info adicional del equipo humano ---\nSolicitud: ${request.title}\nRespuesta de ${request.target_email}:\n${request.response_text ?? '(sin texto)'}`;

    if (request.response_files && Array.isArray(request.response_files) && request.response_files.length > 0) {
      const files = request.response_files as HumanResponseFile[];
      const { docTextBlocks, images } = await processHumanAttachments(files);
      humanImages = images;
      if (docTextBlocks.length > 0) {
        humanBlock += `\n\n--- Contenido de documentos adjuntos ---\n${docTextBlocks.join('\n\n')}`;
      }
      if (images.length > 0) {
        humanBlock += `\n\nImágenes adjuntas (visibles como bloques image): ${images.map(i => i.name).join(', ')}`;
      }
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
      attachmentImages: humanImages.length > 0 ? humanImages : undefined,
    });

    await supabase.from('human_requests').update({ resume_triggered_at: new Date().toISOString() }).eq('id', requestId);
  } catch (err) {
    console.error('[resume] processInboxEmail failed:', err);
    // Deja resume_triggered_at NULL; cron puede reintentar
  }
}
