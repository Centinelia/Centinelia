// Cron: autotag retry para fichas con autotag_status='pending'.
//
// Ejecuta cada 5 minutos. Procesa hasta 20 fichas por vuelta:
//   1. Query fichas con autotag_status='pending' y updated_at < now()-5min.
//   2. Para cada ficha: verificar autotag_retries en metadata.
//      - Si autotag_retries >= 3 → marcar 'error' (3-strike limit, no reintentar).
//      - Si < 3 → llamar autotagFicha() y actualizar tags + status.
//   3. Incrementar metadata.autotag_retries en cada intento.
//
// COBRO: ninguno. El retry de autotag es setup absorbido por Centinelia.
// Ver feedback_batch_eval_no_charge.
//
// Auth: Bearer CRON_SECRET.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { autotagFicha } from '@/lib/autotag/service';

const BATCH_LIMIT      = 20;
const MIN_PENDING_MINS = 5;
const MAX_RETRIES      = 3;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fichas con autotag_status='pending' que llevan al menos MIN_PENDING_MINS sin actualizarse.
  const staleThreshold = new Date(Date.now() - MIN_PENDING_MINS * 60_000).toISOString();

  const { data: pendingFichas, error: queryErr } = await supabase
    .from('fichas_informativas')
    .select('id, portal_email, raw_text, titulo, metadata')
    .eq('autotag_status', 'pending')
    .lt('updated_at', staleThreshold)
    .limit(BATCH_LIMIT);

  if (queryErr) {
    console.error('[autotag-retry] Error al consultar fichas pending:', queryErr.message);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  const fichas = pendingFichas ?? [];
  let processed = 0;
  let errors    = 0;

  for (const ficha of fichas) {
    const fichaId     = ficha.id as string;
    const portalEmail = ficha.portal_email as string;
    const rawText     = (ficha.raw_text as string | null) ?? (ficha.titulo as string | null) ?? '';
    const metadata    = (ficha.metadata as Record<string, unknown> | null) ?? {};
    const retries     = (metadata.autotag_retries as number | undefined) ?? 0;

    // 3-strike limit: no reintentar si ya se falló 3 veces.
    if (retries >= MAX_RETRIES) {
      const { error: errMarkErr } = await supabase
        .from('fichas_informativas')
        .update({
          autotag_status: 'error',
          updated_at:     new Date().toISOString(),
          metadata:       { ...metadata, autotag_retries: retries, last_autotag_error: '3-strike limit reached' },
        })
        .eq('id', fichaId);

      if (errMarkErr) {
        console.warn('[autotag-retry] No se pudo marcar error en ficha', fichaId, errMarkErr.message);
      }
      errors++;
      continue;
    }

    // Incrementar retries antes del intento (incluso si falla por timeout)
    const newRetries = retries + 1;

    try {
      const result = await autotagFicha(portalEmail, rawText);

      const { error: updateErr } = await supabase
        .from('fichas_informativas')
        .update({
          tags:           result.tags,
          autotag_status: result.status,
          updated_at:     new Date().toISOString(),
          metadata: {
            ...metadata,
            autotag_retries: result.status === 'done' ? newRetries : newRetries,
            ...(result.status === 'error' ? { last_autotag_error: 'llm_error' } : {}),
          },
        })
        .eq('id', fichaId);

      if (updateErr) {
        console.warn('[autotag-retry] No se pudo actualizar ficha', fichaId, updateErr.message);
        errors++;
      } else {
        processed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[autotag-retry] Error procesando ficha', fichaId, msg);

      // Marcar como pending con retry incrementado (se volverá a intentar en el siguiente ciclo)
      await supabase
        .from('fichas_informativas')
        .update({
          autotag_status: 'pending',
          updated_at:     new Date().toISOString(),
          metadata: { ...metadata, autotag_retries: newRetries, last_autotag_error: msg },
        })
        .eq('id', fichaId)
        .catch((updateErr: unknown) => {
          console.warn('[autotag-retry] No se pudo actualizar metadata tras error', fichaId, updateErr);
        });

      errors++;
    }
  }

  return NextResponse.json({
    processed,
    errors,
    total_pending_found: fichas.length,
  });
}
