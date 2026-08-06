// TEMPORAL: re-procesa una row de ops_inbox forzando fetch de attachments + LLM
// pass nuevamente. Solo funciona en NODE_ENV=development. Borrar tras validación.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConnector } from '@/lib/connectors';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { processIncomingAttachments } from '@/lib/email/attachment-reader';
import { resolveAutoMode } from '@/lib/email/email-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'dev only' }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: inbox } = await supabase.from('ops_inbox').select('*').eq('id', id).single();
  if (!inbox) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: agent } = await supabase.from('voice_agents').select('*').eq('id', inbox.agent_id).single();
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 });

  // Resolver integración per-agent (para fetch de attachments)
  const { data: perAgent } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', inbox.agent_id)
    .eq('needs_reauth', false)
    .maybeSingle();

  let integration = perAgent as Parameters<typeof getConnector>[0] | null;

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
        agent_id:           inbox.agent_id,
        provider:           o.provider as 'gmail' | 'outlook',
        email:              (o.account_label as string | null) ?? '',
        access_token:       (o.access_token as string | null) ?? '',
        refresh_token:      (o.refresh_token as string | null) ?? null,
        token_expires_at:   (o.expires_at as string | null) ?? null,
        last_sync_at:       null,
        needs_reauth:       false,
        reauth_notified_at: null,
      } as unknown as Parameters<typeof getConnector>[0];
    }
  }

  if (!integration) return NextResponse.json({ error: 'no integration' }, { status: 400 });

  const conn = await getConnector(integration, supabase);

  // Fetch by id — bypassa filtro unread para agarrar correos ya markead read
  const emailFetcher = conn.email as unknown as { getMessageById?: (id: string) => Promise<{ attachments?: Array<{ id: string; name: string; mimeType: string; size: number }> } | null> };
  const emailMsg = emailFetcher.getMessageById
    ? await emailFetcher.getMessageById(inbox.raw_message_id as string)
    : null;
  const attachments = emailMsg?.attachments ?? [];

  const processed = await processIncomingAttachments(conn.email, inbox.raw_message_id as string, attachments);

  let body = (inbox.email_body as string) ?? '';
  if (processed.docTextBlocks.length > 0) {
    body += `\n\n--- Contenido de documentos adjuntos ---\n${processed.docTextBlocks.join('\n\n')}`;
  }
  if (processed.skipped.length > 0) {
    body += `\n\n[Adjuntos no leídos: ${processed.skipped.join(', ')}]`;
  }

  const { data: orgData } = agent.portal_email
    ? await supabase.from('organizations').select('knowledge_base, auto_mode_disabled_at').eq('portal_email', agent.portal_email).maybeSingle()
    : { data: null };

  const orgDisabled = !!(orgData as Record<string, unknown> | null)?.auto_mode_disabled_at;
  const autoMode = resolveAutoMode({
    trust_stage: (agent as Record<string, unknown>).trust_stage as number | null,
    orgDisabled,
  });

  try {
    await processInboxEmail({
      agentId:           agent.id,
      source:            (inbox.source as string) ?? 'gmail',
      rawMessageId:      (inbox.raw_message_id as string) ?? undefined,
      threadId:          (inbox.thread_id as string) ?? undefined,
      emailFrom:         inbox.email_from as string,
      emailSubject:      (inbox.email_subject as string) ?? '',
      emailBody:         body,
      attachments:       attachments.map(a => ({
        name: a.name, url: `gmail:${inbox.raw_message_id}/${a.id}`, type: a.mimeType, size: a.size,
      })),
      attachmentImages:  processed.images.length > 0 ? processed.images : undefined,
      agentName:         (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:      agent.business_name as string,
      knowledgeBase:     (orgData?.knowledge_base as string | null) ?? null,
      roleKB:            agent.role_knowledge_base as string | null,
      agentRole:         agent.role as string | null,
      ownerEmail:        agent.client_email as string,
      portalToken:       agent.portal_token as string,
      portalEmail:       agent.portal_email as string | undefined,
      autoMode,
      approvalEmail:     (agent as Record<string, unknown>).approval_email as string | null | undefined,
      existingInboxId:   inbox.id,
    });
    return NextResponse.json({
      ok: true,
      reprocessed: inbox.id,
      attachments_found: attachments.length,
      docs_parsed: processed.docTextBlocks.length,
      images_extracted: processed.images.length,
      skipped: processed.skipped,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
