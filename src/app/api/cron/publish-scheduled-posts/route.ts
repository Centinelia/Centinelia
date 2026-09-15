export const dynamic = 'force-dynamic';
// Frecuencia: "*/5 * * * *" — publica posts programados cada 5 minutos.

import { defineCron, errorMessage } from '@/lib/cron/define-cron';
import { buildPublisher } from '@/lib/social/publishers';

export const GET = defineCron({
  name:        'navi-publish-scheduled-posts',
  maxDuration: 300,
  handler: async ({ supabase, now, log }) => {
    // Cargar drafts con status 'scheduled' o 'approved' cuyo scheduled_for ya pasó.
    const { data: drafts, error: fetchErr } = await supabase
      .from('content_drafts')
      .select(`
        id, caption, hashtags, media_type, media_urls, retry_count,
        social_account_id,
        social_accounts!inner(
          id, provider, access_token, refresh_token, expires_at,
          external_account_id, external_username, page_id, brand_summary,
          denylist_words, paused, status, metadata,
          agent_id, portal_email
        ),
        organizations!inner(account_status, features)
      `)
      .in('status', ['scheduled', 'approved'])
      .not('scheduled_for', 'is', null)
      .lte('scheduled_for', now.toISOString())
      .limit(100);

    if (fetchErr) {
      throw new Error(`Error cargando drafts: ${fetchErr.message}`);
    }

    const rows = drafts ?? [];
    let published = 0;
    let failed = 0;
    let skipped = 0;
    let cancelled = 0;
    const errors: string[] = [];

    for (const draft of rows) {
      const org     = draft.organizations as unknown as { account_status: string; features: Record<string, unknown> | null };
      const account = draft.social_accounts as unknown as {
        id: string;
        provider: string;
        access_token: string;
        refresh_token: string | null;
        expires_at: string | null;
        external_account_id: string;
        external_username: string | null;
        page_id: string | null;
        brand_summary: string | null;
        denylist_words: string[];
        paused: boolean;
        status: string;
        metadata: Record<string, unknown>;
        agent_id: string | null;
        portal_email: string;
      };

      // R62: org inactiva → cancelar draft
      if (org.account_status !== 'active') {
        const { error: cancelErr } = await supabase
          .from('content_drafts')
          .update({ status: 'cancelled', error_message: 'org_inactive' })
          .eq('id', draft.id);
        if (cancelErr) {
          log.error(`draft ${draft.id} cancel error`, { error: cancelErr.message });
          errors.push(`${draft.id}: cancel org_inactive: ${cancelErr.message}`);
        } else {
          cancelled++;
        }
        continue;
      }

      // R62: feature social_publishing no habilitada → skip (no cancelar)
      const socialPub = (org.features as { social_publishing?: { enabled?: boolean } } | null)?.social_publishing;
      if (!socialPub?.enabled) {
        log.info(`draft ${draft.id} skipped — social_publishing disabled`);
        skipped++;
        continue;
      }

      // R62: cuenta pausada → skip
      if (account.paused) {
        log.info(`draft ${draft.id} skipped — social_account paused`);
        skipped++;
        continue;
      }

      // Marcar como publicando
      await supabase
        .from('content_drafts')
        .update({ status: 'publishing' })
        .eq('id', draft.id);

      try {
        const publisher = buildPublisher({
          id:                  account.id,
          portal_email:        account.portal_email,
          agent_id:            account.agent_id ?? '',
          provider:            account.provider as 'meta_instagram' | 'meta_facebook',
          external_account_id: account.external_account_id,
          external_username:   account.external_username ?? undefined,
          page_id:             account.page_id ?? undefined,
          brand_summary:       account.brand_summary ?? undefined,
          denylist_words:      account.denylist_words,
          paused:              account.paused,
          paused_reason:       null,
          paused_at:           null,
          access_token:        account.access_token,
          refresh_token:       account.refresh_token ?? undefined,
          expires_at:          account.expires_at ?? undefined,
          status:   account.status as 'active' | 'needs_reauth' | 'disconnected',
          metadata: account.metadata,
        });

        const caption = [
          draft.caption ?? '',
          (draft.hashtags as string[] ?? []).join(' '),
        ].filter(Boolean).join('\n\n').trim();

        const { containerId } = await publisher.createMediaContainer({
          mediaType: draft.media_type as 'image' | 'carousel' | 'reel' | 'story',
          mediaUrls: draft.media_urls as string[],
          caption,
        });

        const readiness = await publisher.waitForContainerReady(containerId);
        if (readiness !== 'ready') {
          throw new Error(`Container no listo: ${readiness}`);
        }

        const { mediaId, permalink } = await publisher.publishContainer(containerId);

        await supabase
          .from('content_drafts')
          .update({
            status:             'published',
            published_media_id: mediaId,
            published_permalink: permalink,
            published_at:       new Date().toISOString(),
            error_message:      null,
          })
          .eq('id', draft.id);

        log.info(`draft ${draft.id} publicado`, { mediaId, permalink });
        published++;
      } catch (err) {
        // R63: retry_count acumulativo; al llegar a 3 → failed
        const prevRetry = (draft.retry_count as number) ?? 0;
        const nextRetry = prevRetry + 1;
        const nextStatus = nextRetry >= 3 ? 'failed' : 'scheduled';

        await supabase
          .from('content_drafts')
          .update({
            status:        nextStatus,
            retry_count:   nextRetry,
            error_message: errorMessage(err),
          })
          .eq('id', draft.id);

        const msg = `${draft.id} (retry ${nextRetry}): ${errorMessage(err)}`;
        log.error(`draft falló`, { draftId: draft.id, retry: nextRetry, error: errorMessage(err) });
        errors.push(msg);
        failed++;
      }
    }

    return {
      expected:  rows.length,
      processed: published + skipped + cancelled,
      errors,
      metadata:  { published, failed, skipped, cancelled },
    };
  },
});
