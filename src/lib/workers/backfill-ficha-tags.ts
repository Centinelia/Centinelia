/**
 * Worker de backfill masivo para fichas legacy sin tags.
 *
 * Procesa fichas con autotag_status='untagged_legacy' para orgs con
 * retrieval_v2_enabled=true en organizations.features.
 *
 * FEATURE FLAG: retrieval_v2_enabled per-org (default OFF).
 * Si el flag no está en organizations.features, NO se procesa el org.
 * Activación manual por Nazre, per-org, desde el panel de admin.
 *
 * COBRO: CERO ops al cliente. Costo absorbido por Centinelia como migración
 * interna. Entradas del ledger usan bill_to='centinelia_migration'.
 * Ver feedback_batch_eval_no_charge y spec Sección 3.
 *
 * RATE LIMIT: delay de 100ms entre fichas (10 fichas/seg máx agregado).
 * Batch de 50 fichas por org por vuelta.
 *
 * RETRY POLICY: fichas que fallan se mueven a autotag_status='pending'.
 * El retry cron (autotag-retry) las reintenta con 3-strike limit.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { autotagFicha } from '@/lib/autotag/service';

const BATCH_PER_ORG    = 50;
const DELAY_MS_BETWEEN = 100; // 10 fichas/seg máx

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface BackfillResult {
  orgs_processed:   number;
  fichas_processed: number;
  fichas_error:     number;
  orgs_skipped:     number;
}

/**
 * Ejecuta un ciclo de backfill para todos los orgs con retrieval_v2_enabled=true.
 * Llamado desde el cron endpoint cada 10 minutos.
 */
export async function backfillFichaTags(): Promise<BackfillResult> {
  const supabase = createAdminClient();

  // 1. Obtener orgs con retrieval_v2_enabled=true
  // La columna features es jsonb. Buscamos el campo 'retrieval_v2_enabled'=true.
  const { data: orgs, error: orgsErr } = await supabase
    .from('organizations')
    .select('portal_email, features')
    .filter('features->>retrieval_v2_enabled', 'eq', 'true');

  if (orgsErr) {
    console.error('[backfill-ficha-tags] Error al consultar orgs:', orgsErr.message);
    throw orgsErr;
  }

  const eligibleOrgs = (orgs ?? []).filter(o => {
    const features = (o.features as Record<string, unknown> | null) ?? {};
    return features.retrieval_v2_enabled === true;
  });

  if (eligibleOrgs.length === 0) {
    return { orgs_processed: 0, fichas_processed: 0, fichas_error: 0, orgs_skipped: (orgs ?? []).length };
  }

  let fichasProcessed = 0;
  let fichasError     = 0;
  let orgsProcessed   = 0;

  for (const org of eligibleOrgs) {
    const portalEmail = org.portal_email as string;

    // 2. Obtener batch de fichas legacy del org
    const { data: fichas, error: fichasErr } = await supabase
      .from('fichas_informativas')
      .select('id, raw_text, titulo')
      .eq('portal_email', portalEmail)
      .eq('autotag_status', 'untagged_legacy')
      .order('created_at', { ascending: true })
      .limit(BATCH_PER_ORG);

    if (fichasErr) {
      console.error('[backfill-ficha-tags] Error al consultar fichas del org', portalEmail, fichasErr.message);
      continue;
    }

    const batch = fichas ?? [];
    if (batch.length === 0) continue;

    orgsProcessed++;

    for (const ficha of batch) {
      const fichaId = ficha.id as string;
      const rawText = (ficha.raw_text as string | null) ?? (ficha.titulo as string | null) ?? '';

      try {
        const result = await autotagFicha(portalEmail, rawText);

        if (result.status === 'done') {
          await supabase
            .from('fichas_informativas')
            .update({
              tags:           result.tags,
              autotag_status: 'done',
              updated_at:     new Date().toISOString(),
            })
            .eq('id', fichaId);
          fichasProcessed++;
        } else if (result.status === 'error') {
          // Mover a 'pending' para que el retry cron lo atrape
          await supabase
            .from('fichas_informativas')
            .update({
              autotag_status: 'pending',
              updated_at:     new Date().toISOString(),
            })
            .eq('id', fichaId);
          fichasError++;
        } else {
          // status='pending' (timeout) → también lo toma el retry cron
          await supabase
            .from('fichas_informativas')
            .update({
              autotag_status: 'pending',
              updated_at:     new Date().toISOString(),
            })
            .eq('id', fichaId);
          fichasError++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[backfill-ficha-tags] Error en ficha', fichaId, msg);

        // Mover a pending para retry
        await supabase
          .from('fichas_informativas')
          .update({
            autotag_status: 'pending',
            updated_at:     new Date().toISOString(),
          })
          .eq('id', fichaId)
          .catch((e: unknown) => {
            console.warn('[backfill-ficha-tags] No se pudo actualizar pending en ficha', fichaId, e);
          });

        fichasError++;
      }

      // Rate limit: 100ms entre fichas (10/seg)
      await delay(DELAY_MS_BETWEEN);
    }
  }

  return {
    orgs_processed:   orgsProcessed,
    fichas_processed: fichasProcessed,
    fichas_error:     fichasError,
    orgs_skipped:     (orgs ?? []).length - orgsProcessed,
  };
}
