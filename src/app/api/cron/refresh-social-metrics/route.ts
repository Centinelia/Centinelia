export const dynamic = 'force-dynamic';
// Frecuencia: "0 * * * *" — toma snapshots de métricas cada hora.

import { defineCron, errorMessage } from '@/lib/cron/define-cron';
import { buildPublisher } from '@/lib/social/publishers';

// Umbrales para decidir qué snapshot tomar
const SNAPSHOT_THRESHOLDS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d':   7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

type SnapshotType = keyof typeof SNAPSHOT_THRESHOLDS;

export const GET = defineCron({
  name:        'navi-refresh-social-metrics',
  maxDuration: 300,
  handler: async ({ supabase, now, log }) => {
    // Drafts publicados con media id disponible
    const { data: drafts, error: fetchErr } = await supabase
      .from('content_drafts')
      .select(`
        id, published_at, published_media_id,
        social_account_id,
        social_accounts!inner(
          id, provider, access_token, refresh_token, expires_at,
          external_account_id, external_username, page_id, brand_summary,
          denylist_words, paused, status, metadata, agent_id, portal_email
        )
      `)
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .not('published_media_id', 'is', null)
      .limit(200);

    if (fetchErr) {
      throw new Error(`Error cargando drafts publicados: ${fetchErr.message}`);
    }

    const rows = drafts ?? [];
    let processed = 0;
    let expected = 0;               // solo cuenta snapshots que TOCABA crear (no drafts sin trabajo)
    let skippedTooRecent = 0;       // draft < 24h, ningún snapshot aplica todavía
    let skippedAlreadyPresent = 0;  // draft ya tiene todos los snapshots pendientes
    let skippedSmoke = 0;           // draft con tokens/media sintéticos de smoke tests (ver incidente 2026-09-17)
    const errors: string[] = [];

    for (const draft of rows) {
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

      // Guard defensivo: skip cuentas/drafts sintéticos de smoke tests que hayan
      // leakeado a prod. Sin este guard, cada corrida hourly del cron intentaba
      // fetchMetrics contra Meta con tokens fake, generando alertas [CRITICO] cada
      // hora hasta que se limpiaran manualmente (incidente 2026-09-17).
      const looksSynthetic =
        (typeof account.access_token === 'string' && account.access_token.startsWith('smoke-')) ||
        (typeof account.external_account_id === 'string' && account.external_account_id.startsWith('smoke-')) ||
        (typeof draft.published_media_id === 'string' && draft.published_media_id.startsWith('smoke-'));
      if (looksSynthetic) {
        skippedSmoke++;
        log.info('Skip draft sintético (smoke leftover)', {
          draftId:  draft.id,
          mediaId:  draft.published_media_id,
          account:  account.external_account_id,
        });
        continue;
      }

      const publishedAt = new Date(draft.published_at as string).getTime();
      const ageMs = now.getTime() - publishedAt;

      // Determinar qué snapshot_types corresponden según la antigüedad del post
      const candidateTypes: SnapshotType[] = (
        Object.entries(SNAPSHOT_THRESHOLDS) as Array<[SnapshotType, number]>
      )
        .filter(([, thresholdMs]) => ageMs >= thresholdMs)
        .map(([type]) => type);

      if (candidateTypes.length === 0) { skippedTooRecent++; continue; }

      // Verificar qué snapshots ya existen para este draft
      const { data: existing } = await supabase
        .from('social_metrics')
        .select('snapshot_type')
        .eq('content_draft_id', draft.id)
        .in('snapshot_type', candidateTypes);

      const existingTypes = new Set((existing ?? []).map(r => r.snapshot_type as string));
      const missingTypes = candidateTypes.filter(t => !existingTypes.has(t));

      if (missingTypes.length === 0) { skippedAlreadyPresent++; continue; }

      // Este draft SÍ va a intentar crear N snapshots → contarlos como expected
      expected += missingTypes.length;

      // Obtener métricas desde Meta
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

        const metrics = await publisher.fetchMetrics(draft.published_media_id as string);

        for (const snapshotType of missingTypes) {
          const { error: upsertErr } = await supabase
            .from('social_metrics')
            .upsert(
              {
                content_draft_id: draft.id,
                snapshot_type:    snapshotType,
                snapshot_at:      now.toISOString(),
                impressions:      metrics.impressions ?? null,
                reach:            metrics.reach ?? null,
                likes:            metrics.likes ?? null,
                comments:         metrics.comments ?? null,
                shares:           metrics.shares ?? null,
                saves:            metrics.saves ?? null,
                plays:            metrics.plays ?? null,
                raw_response:     metrics.rawResponse ?? null,
              },
              {
                onConflict:       'content_draft_id,snapshot_type',
                ignoreDuplicates: false,
              },
            );

          if (upsertErr) {
            const msg = `${draft.id}/${snapshotType}: ${upsertErr.message}`;
            log.error('Error upsertando snapshot', { draftId: draft.id, snapshotType, error: upsertErr.message });
            errors.push(msg);
          } else {
            log.info(`Snapshot ${snapshotType} guardado`, { draftId: draft.id });
            processed++;
          }
        }
      } catch (err) {
        const msg = `${draft.id}: ${errorMessage(err)}`;
        log.error('Error obteniendo métricas', { draftId: draft.id, error: errorMessage(err) });
        errors.push(msg);
      }
    }

    return {
      expected,
      processed,
      errors,
      metadata: {
        drafts_seen:             rows.length,
        skipped_too_recent:      skippedTooRecent,
        skipped_already_present: skippedAlreadyPresent,
        skipped_smoke:           skippedSmoke,
        snapshots_created:       processed,
      },
    };
  },
});
