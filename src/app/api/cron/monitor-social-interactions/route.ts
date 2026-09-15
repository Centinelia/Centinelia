export const dynamic = 'force-dynamic';
// Frecuencia: "*/10 * * * *" — monitorea comentarios y DMs cada 10 minutos.

import { defineCron, errorMessage } from '@/lib/cron/define-cron';
import { buildPublisher } from '@/lib/social/publishers';
import { classifySentiment } from '@/lib/social/sentiment';
import type { SentimentLabel } from '@/lib/social/sentiment';

// Mapping R65: sentiment → response_status
function resolveResponseStatus(sentiment: SentimentLabel): 'auto_replied' | 'pending_approval' | 'escalated_to_human' {
  if (sentiment === 'positive')                       return 'auto_replied';
  if (sentiment === 'neutral')                        return 'pending_approval';
  if (sentiment === 'negative' || sentiment === 'crisis') return 'escalated_to_human';
  return 'pending_approval';
}

export const GET = defineCron({
  name:        'navi-monitor-social-interactions',
  maxDuration: 300,
  handler: async ({ supabase, now, log }) => {
    // Cuentas Meta activas y no pausadas
    const { data: accounts, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id, portal_email, agent_id, provider, access_token, refresh_token, expires_at, external_account_id, external_username, page_id, brand_summary, denylist_words, paused, status, metadata')
      .eq('provider', 'meta_instagram')
      .eq('status', 'active')
      .eq('paused', false);

    if (fetchErr) {
      throw new Error(`Error cargando cuentas: ${fetchErr.message}`);
    }

    const rows = accounts ?? [];
    let processed = 0;
    const errors: string[] = [];

    for (const account of rows) {
      const meta = (account.metadata as Record<string, unknown>) ?? {};

      // Ventana desde la última verificación (default: últimas 24 horas)
      const lastCheckRaw = meta.last_interaction_check_at as string | undefined;
      const sinceMs = lastCheckRaw
        ? new Date(lastCheckRaw).getTime()
        : now.getTime() - 24 * 60 * 60 * 1000;

      const publisher = buildPublisher({
        id:                  account.id as string,
        portal_email:        account.portal_email as string,
        // SocialAccount.agent_id es string (no null) — fallback a empty string si es null
        agent_id:            (account.agent_id as string | null) ?? '',
        provider:            account.provider as 'meta_instagram' | 'meta_facebook',
        external_account_id: account.external_account_id as string,
        // Campos opcionales: null → undefined para SocialAccount interface
        external_username:   (account.external_username as string | null) ?? undefined,
        page_id:             (account.page_id as string | null) ?? undefined,
        brand_summary:       (account.brand_summary as string | null) ?? undefined,
        denylist_words:      (account.denylist_words as string[] | null) ?? [],
        paused:              account.paused as boolean,
        paused_reason:       null,
        paused_at:           null,
        access_token:        account.access_token as string,
        refresh_token:       (account.refresh_token as string | null) ?? undefined,
        expires_at:          (account.expires_at as string | null) ?? undefined,
        status:   account.status as 'active' | 'needs_reauth' | 'disconnected',
        metadata: meta,
      });

      // Obtener últimos posts publicados de esta cuenta para iterar sus comentarios
      const { data: recentDrafts } = await supabase
        .from('content_drafts')
        .select('id, published_media_id')
        .eq('social_account_id', account.id as string)
        .eq('status', 'published')
        .not('published_media_id', 'is', null)
        .order('published_at', { ascending: false })
        .limit(10);

      const agentId     = account.agent_id as string | null;
      const portalEmail = account.portal_email as string;
      let accountInteractions = 0;

      try {
        // Comentarios por cada post reciente
        for (const draft of recentDrafts ?? []) {
          if (!draft.published_media_id) continue;

          let comments: Awaited<ReturnType<typeof publisher.listRecentComments>>;
          try {
            comments = await publisher.listRecentComments(draft.published_media_id as string, sinceMs);
          } catch (err) {
            log.warn(`Error listando comentarios del post ${draft.published_media_id}`, { error: errorMessage(err) });
            continue;
          }

          for (const comment of comments) {
            try {
              const sentiment = await classifySentiment(comment.text, { agentId, portalEmail });
              const responseStatus = resolveResponseStatus(sentiment);

              // TODO: para auto_replied se podría enviar ack automático cuando haya template match.
              // Por ahora se marca auto_replied en response_status pero navi_response queda null.
              const { error: upsertErr } = await supabase
                .from('social_interactions')
                .upsert(
                  {
                    portal_email:      portalEmail,
                    social_account_id: account.id as string,
                    content_draft_id:  draft.id,
                    interaction_type:  'comment',
                    external_id:       comment.id,
                    external_from:     comment.from,
                    incoming_text:     comment.text,
                    sentiment,
                    navi_response:     null,
                    response_status:   responseStatus,
                  },
                  { onConflict: 'external_id,interaction_type', ignoreDuplicates: true },
                );

              if (upsertErr) {
                log.warn(`Error upsertando interacción comment ${comment.id}`, { error: upsertErr.message });
              } else {
                accountInteractions++;
              }
            } catch (err) {
              log.warn(`Error procesando comment ${comment.id}`, { error: errorMessage(err) });
            }
          }
        }

        // DMs de la cuenta
        let dms: Awaited<ReturnType<typeof publisher.listRecentDms>>;
        try {
          dms = await publisher.listRecentDms(sinceMs);
        } catch (err) {
          log.warn(`Error listando DMs de cuenta ${account.id}`, { error: errorMessage(err) });
          dms = [];
        }

        for (const dm of dms) {
          try {
            const sentiment = await classifySentiment(dm.text, { agentId, portalEmail });
            const responseStatus = resolveResponseStatus(sentiment);

            // TODO: auto_replied = enviar ack automático cuando haya template match implementado.
            const { error: upsertErr } = await supabase
              .from('social_interactions')
              .upsert(
                {
                  portal_email:      portalEmail,
                  social_account_id: account.id as string,
                  content_draft_id:  null,
                  interaction_type:  'dm',
                  external_id:       dm.threadId,
                  external_from:     dm.from,
                  incoming_text:     dm.text,
                  sentiment,
                  navi_response:     null,
                  response_status:   responseStatus,
                },
                { onConflict: 'external_id,interaction_type', ignoreDuplicates: true },
              );

            if (upsertErr) {
              log.warn(`Error upsertando DM ${dm.threadId}`, { error: upsertErr.message });
            } else {
              accountInteractions++;
            }
          } catch (err) {
            log.warn(`Error procesando DM ${dm.threadId}`, { error: errorMessage(err) });
          }
        }

        // Actualizar last_interaction_check_at en metadata
        const updatedMeta = { ...meta, last_interaction_check_at: now.toISOString() };
        await supabase
          .from('social_accounts')
          .update({ metadata: updatedMeta })
          .eq('id', account.id as string);

        log.info(`Cuenta ${account.id} procesada`, { interactions: accountInteractions });
        processed++;
      } catch (err) {
        const msg = `${account.id}: ${errorMessage(err)}`;
        log.error('Error procesando cuenta', { accountId: account.id, error: errorMessage(err) });
        errors.push(msg);
      }
    }

    return {
      expected:  rows.length,
      processed,
      errors,
      metadata:  { accounts_seen: rows.length },
    };
  },
});
