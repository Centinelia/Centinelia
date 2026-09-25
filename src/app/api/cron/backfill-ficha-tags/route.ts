// Cron: backfill masivo de fichas legacy sin tags.
//
// Ejecuta cada 10 minutos. Procesa hasta 50 fichas por org activo por vuelta.
// Solo corre en orgs con organizations.features.retrieval_v2_enabled=true.
//
// FEATURE FLAG: retrieval_v2_enabled OFF por default. Sin flag explícito = NO corre.
// Activación manual por Nazre desde panel admin.
//
// COBRO: CERO ops al cliente. Costo de Anthropic absorbido por Centinelia.
// Ver feedback_batch_eval_no_charge y spec Sección 3 "Migración fichas legacy".
//
// RATE LIMIT: 100ms entre fichas = ~10 fichas/seg máx.
//
// Auth: Bearer CRON_SECRET.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { backfillFichaTags } from '@/lib/workers/backfill-ficha-tags';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await backfillFichaTags();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[backfill-ficha-tags] Error fatal en el worker:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
