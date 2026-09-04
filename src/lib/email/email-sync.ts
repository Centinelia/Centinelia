import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { getConnector, type IntegrationRow } from '@/lib/connectors';
import { quickClassifyEmail } from '@/lib/ops/email-quick-classify';
import { EMAIL_BODY_TRUNCATE_CHARS } from '@/lib/constants';
import { processIncomingAttachments } from '@/lib/email/attachment-reader';
import type { EmailConnector } from '@/lib/connectors/types';

/**
 * Enriquece el body del correo con el texto parseado de documentos adjuntos,
 * y regresa las imágenes listas para multimodal. Tolerante a fallos: si
 * fetchAttachment no está implementado o falla, regresa body original + [].
 */
async function enrichWithAttachments(
  emailConn: EmailConnector,
  msg: { id: string; body: string; attachments?: Array<{ id: string; name: string; mimeType: string; size: number }> },
): Promise<{ body: string; images: Array<{ name: string; base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }>; metas: Array<{ name: string; url: string; type: string; size: number }> }> {
  const metas = (msg.attachments ?? []).map(a => ({
    name: a.name, url: `gmail:${msg.id}/${a.id}`, type: a.mimeType, size: a.size,
  }));
  if (!msg.attachments || msg.attachments.length === 0) {
    return { body: msg.body, images: [], metas };
  }
  const processed = await processIncomingAttachments(emailConn, msg.id, msg.attachments);
  let body = msg.body;
  if (processed.docTextBlocks.length > 0) {
    body += `\n\n--- Contenido de documentos adjuntos ---\n${processed.docTextBlocks.join('\n\n')}`;
  }
  if (processed.skipped.length > 0) {
    body += `\n\n[Adjuntos no leídos: ${processed.skipped.join(', ')}]`;
  }
  return { body, images: processed.images, metas };
}

type EmailIntegration = IntegrationRow & {
  agent_id:     string;
  email:        string;
  auto_reply:   boolean;
  last_sync_at: string | null;
};

export type AutoMode = 'observador' | 'off' | 'auto' | 'always';

interface ResolveAutoModeInput {
  trust_stage: number | null;       // voice_agents.trust_stage (1=Observador, 2=Supervisado, 3=Autónomo)
  orgDisabled: boolean;             // organizations.auto_mode_disabled_at IS NOT NULL
}

/**
 * Kill switch global. Antes hacía strict `=== 'false'`, lo que provocaba que
 * `AUTO_MODE_CLASSIFIER_ENABLED=off` (o `'0'`, `'no'`, `'False'`) NO deshabilitara
 * como el operador esperaba. Aceptamos ahora los valores comunes de disable.
 * Default (undefined) sigue siendo enabled — es el comportamiento intencional.
 */
export function isAutoModeClassifierDisabled(): boolean {
  const raw = process.env.AUTO_MODE_CLASSIFIER_ENABLED?.trim().toLowerCase();
  if (raw === undefined || raw === '') return false;
  return ['false', 'off', '0', 'no', 'disabled'].includes(raw);
}

/**
 * Resuelve el modo efectivo del agente. Un solo eje de autonomía: Trust Stage.
 *   Stage 1 (Observador) → 'observador': triage-only (categoría + resumen), sin borrador
 *   Stage 2 (Supervisado) → 'off': redacta borrador, siempre a aprobación humana
 *   Stage 3 (Autónomo, default) → 'auto': classifier decide send/human/block
 *
 * Overrides (fuerzan 'off'):
 *   1. env AUTO_MODE_CLASSIFIER_ENABLED disabled (kill switch global — ver helper)
 *   2. orgDisabled (kill switch per-org via organizations.auto_mode_disabled_at)
 *
 * NOTA: el override legacy `auto_reply === false` fue removido — no podía distinguir
 * "cliente lo apagó explícitamente" de "migration default lo puso false", lo que causaba
 * que TODOS los agentes cayeran a 'off' aunque trust_stage=3.
 */
export function resolveAutoMode(input: ResolveAutoModeInput): AutoMode {
  if (isAutoModeClassifierDisabled()) return 'off';
  if (input.orgDisabled) return 'off';

  const stage = input.trust_stage ?? 3;
  if (stage <= 1) return 'observador';
  if (stage === 2) return 'off';
  return 'auto';
}

export async function syncAllEmailIntegrations(): Promise<{ synced: number; errors: number }> {
  const supabase = createAdminClient();

  const { data: integrations } = await supabase
    .from('email_integrations')
    .select('*')
    .order('last_sync_at', { ascending: true, nullsFirst: true });

  if (!integrations?.length) return { synced: 0, errors: 0 };

  let synced = 0; let errors = 0;

  for (const integration of integrations as EmailIntegration[]) {
    try {
      await syncIntegration(integration, supabase);
      synced++;
    } catch (err) {
      console.error(`[email-sync] error for ${integration.id}:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

async function syncIntegration(integration: EmailIntegration, supabase: ReturnType<typeof createAdminClient>) {
  const conn = await getConnector(integration, supabase);

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, client_email, portal_token, role_knowledge_base, role, portal_email, approval_email, auto_reply, trust_stage, features')
    .eq('id', integration.agent_id)
    .single();

  const { data: orgData } = agent?.portal_email
    ? await supabase.from('organizations').select('knowledge_base, auto_mode_disabled_at').eq('portal_email', agent.portal_email).single()
    : { data: null };
  const knowledge_base = orgData?.knowledge_base ?? null;
  const orgDisabled    = !!(orgData as Record<string, unknown> | null)?.auto_mode_disabled_at;

  const autoMode = resolveAutoMode({
    trust_stage: (agent as Record<string, unknown>).trust_stage as number | null,
    orgDisabled,
  });

  if (!agent?.client_email) return;

  const since = integration.last_sync_at
    ? new Date(integration.last_sync_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const messages = await conn.email.fetchUnread(since);

  const syncedAt = new Date().toISOString();
  await supabase.from('email_integrations')
    .update({ last_sync_at: syncedAt })
    .eq('id', integration.id);

  // Sync last_sync_at to integration_accounts so the portal UI shows fresh data
  if (agent.portal_email) {
    const { data: ia } = await supabase
      .from('integration_accounts')
      .select('metadata')
      .eq('portal_email', agent.portal_email)
      .eq('provider', integration.provider)
      .maybeSingle();
    const meta = (ia?.metadata as Record<string, unknown>) ?? {};
    await supabase.from('integration_accounts')
      .update({ metadata: { ...meta, last_sync_at: syncedAt } })
      .eq('portal_email', agent.portal_email)
      .eq('provider', integration.provider);
  }

  for (const msg of messages) {
    // Guard against re-processing emails whose markRead silently failed on a prior sync
    const { data: existing } = await supabase
      .from('ops_inbox')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('raw_message_id', msg.id)
      .maybeSingle();

    if (existing) {
      await conn.email.markRead(msg.id).catch((err) =>
        console.error(`[email-sync] markRead retry failed for ${msg.id}:`, err)
      );
      continue;
    }

    // Detect thread reply: dos casos distintos.
    //   (1) status='info_requested' → reusar row existente (Sofía pidió info al cliente y este responde)
    //   (2) status IN ('pending','escalated') o human_request activo → NO reusar row, pero MARCAR client_replied_at
    //       en ambas tablas para advertir al humano que el draft/escalación puede estar desactualizada
    let existingInboxId: string | undefined;
    let originalEmailBody: string | undefined;
    if (msg.threadId) {
      // Caso 1: info_requested — reusar row para continuar el hilo
      const { data: infoThread } = await supabase
        .from('ops_inbox')
        .select('id, email_body')
        .eq('agent_id', agent.id)
        .eq('thread_id', msg.threadId)
        .eq('status', 'info_requested')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (infoThread) {
        existingInboxId   = infoThread.id as string;
        originalEmailBody = infoThread.email_body as string;
      } else {
        // Caso 2: pending o escalated. NO reusamos, pero marcamos advertencia.
        const nowIso = new Date().toISOString();
        const { data: activeThread } = await supabase
          .from('ops_inbox')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('thread_id', msg.threadId)
          .in('status', ['pending', 'escalated'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeThread) {
          await supabase
            .from('ops_inbox')
            .update({ client_replied_at: nowIso })
            .eq('id', activeThread.id);

          // Human requests ligados a ese ops_inbox también reciben la advertencia
          await supabase
            .from('human_requests')
            .update({ client_replied_at: nowIso })
            .eq('source_inbox_id', activeThread.id)
            .in('status', ['pending', 'escalated']);
        }
      }
    }

    await conn.email.markRead(msg.id).catch((err) =>
      console.error(`[email-sync] markRead failed for ${msg.id}:`, err)
    );

    const enriched = await enrichWithAttachments(conn.email, msg);

    await processInboxEmail({
      agentId:           agent.id,
      source:            integration.provider,
      rawMessageId:      msg.id,
      threadId:          msg.threadId,
      emailFrom:         msg.from,
      emailSubject:      msg.subject,
      emailBody:         enriched.body,
      attachments:       enriched.metas,
      attachmentImages:  enriched.images.length > 0 ? enriched.images : undefined,
      agentName:         (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:      agent.business_name as string,
      knowledgeBase:     knowledge_base,
      roleKB:            agent.role_knowledge_base as string | null,
      agentRole:         agent.role as string | null,
      ownerEmail:        agent.client_email as string,
      portalToken:       agent.portal_token as string,
      portalEmail:       agent.portal_email as string | undefined,
      autoMode,
      approvalEmail:     (agent as Record<string, unknown>).approval_email as string | null | undefined,
      existingInboxId,
      originalEmailBody,
      sendReplyFn:       (body: string) => conn.email.sendReply({
        messageId: msg.id,
        threadId:  msg.threadId,
        to:        msg.from,
        subject:   msg.subject,
        body,
      }),
    });
  }

  // ── Spam folder sync (opt-in, rate-limited) ──────────────────────────────────
  const agentFeatures = ((agent as Record<string, unknown>).features as Record<string, unknown> | null) ?? {};
  const checkSpam     = agentFeatures.check_spam_folder === true;

  if (checkSpam && conn.email.fetchUnread) {
    // Fetch last_spam_sync_at from integration_accounts metadata
    let lastSpamSyncAt: string | undefined;
    if (agent.portal_email) {
      const { data: ia } = await supabase
        .from('integration_accounts')
        .select('metadata')
        .eq('portal_email', agent.portal_email)
        .eq('provider', integration.provider)
        .maybeSingle();
      lastSpamSyncAt = ((ia?.metadata as Record<string, unknown>) ?? {}).last_spam_sync_at as string | undefined;
    }

    const thirtyMinMs  = 30 * 60 * 1000;
    const canSyncSpam  = !lastSpamSyncAt || (Date.now() - new Date(lastSpamSyncAt).getTime()) > thirtyMinMs;

    if (canSyncSpam) {
      const spamMessages = await conn.email.fetchUnread(since, 'spam');

      for (const msg of spamMessages) {
        const { data: existing } = await supabase
          .from('ops_inbox')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('raw_message_id', msg.id)
          .maybeSingle();

        if (existing) continue;

        const enrichedSpam = await enrichWithAttachments(conn.email, msg);

        await processInboxEmail({
          agentId:          agent.id,
          source:           integration.provider,
          rawMessageId:     msg.id,
          threadId:         msg.threadId,
          emailFrom:        msg.from,
          emailSubject:     msg.subject,
          emailBody:        enrichedSpam.body,
          attachments:      enrichedSpam.metas,
          attachmentImages: enrichedSpam.images.length > 0 ? enrichedSpam.images : undefined,
          agentName:        (agent.agent_name as string | null) ?? 'Centinelia',
          businessName:     agent.business_name as string,
          knowledgeBase:    knowledge_base,
          roleKB:           agent.role_knowledge_base as string | null,
          agentRole:        agent.role as string | null,
          ownerEmail:       agent.client_email as string,
          portalToken:      agent.portal_token as string,
          portalEmail:      agent.portal_email as string | undefined,
          autoMode,
          approvalEmail:    (agent as Record<string, unknown>).approval_email as string | null | undefined,
          fromSpamFolder:   true,
          unmarkSpamFn:     conn.email.unmarkSpam
            ? (id: string) => conn.email.unmarkSpam!(id)
            : undefined,
          sendReplyFn:      (body: string) => conn.email.sendReply({
            messageId: msg.id,
            threadId:  msg.threadId,
            to:        msg.from,
            subject:   msg.subject,
            body,
          }),
        });
      }

      // Update last_spam_sync_at in integration_accounts
      if (agent.portal_email) {
        const { data: ia } = await supabase
          .from('integration_accounts')
          .select('metadata')
          .eq('portal_email', agent.portal_email)
          .eq('provider', integration.provider)
          .maybeSingle();
        const meta = (ia?.metadata as Record<string, unknown>) ?? {};
        await supabase.from('integration_accounts')
          .update({ metadata: { ...meta, last_spam_sync_at: new Date().toISOString() } })
          .eq('portal_email', agent.portal_email)
          .eq('provider', integration.provider);
      }
    }
  }
}

// ─── Org-shared inbox sync — DEPRECATED 2026-09-04 ────────────────────────
//
// Bandeja org-level (integration_accounts capability='email') fue deprecada.
// Solo Pneuma la usaba y apuntaba al Gmail personal de Nazre (nazre20@gmail.com),
// lo que hacía que todo el spam/marketing/notifs bancarias entrara como
// pendientes a los meerkats. La row se marcó disconnected y el cron email-sync
// ya no llama esta función. Implementación original (~300 líneas incluyendo
// syncOrgInbox + createOrgHumanRequest) preservada vía git blame en commits
// pre-2026-09-04. Si se retoma la feature, replantear expectativas: bandeja
// compartida de negocio (info@empresa.com), NUNCA gmail personal del owner.

/** @deprecated 2026-09-04 — ver comentario arriba. */
export async function syncAllOrgInboxes(): Promise<{ synced: number; errors: number }> {
  return { synced: 0, errors: 0 };
}
