/**
 * GET /api/cron/sync-dropbox-tokens
 *
 * Rota los tokens de Dropbox de todos los clientes con integración
 * `contpaqi` activa. Los tokens del portal OAuth expiran cada ~4h y el
 * adapter Nala lee de una columna separada sin refresh automático; este
 * cron los mantiene sincronizados.
 *
 * Cadence: cada 3h. Margen de renovación 15min (ver REFRESH_MARGIN_MS en
 * token-sync.ts) — con 4h de TTL y 3h de cadence hay ~1h de holgura.
 *
 * Sin feature flag: el cron es no-op si no hay filas en
 * `integration_accounts` con provider='dropbox', así que corre siempre
 * sin costo hasta que haya al menos un cliente. Cuando haya clientes, la
 * rotación tiene que estar activa desde el primer momento — si la
 * gateamos con un flag y se nos olvida flipearla, el pipeline queda muerto
 * cada 4h.
 *
 * Auth: Bearer CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { syncAllActiveTokens } from '@/lib/dropbox/token-sync';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { results, summary } = await syncAllActiveTokens();
    return NextResponse.json({
      ok:       true,
      summary,
      results:  results.map(r => ({
        portal_email: r.portal_email,
        outcome:      r.outcome,
        refreshed:    r.refreshed,
        expires_at:   r.expires_at,
        error:        r.error,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-dropbox-tokens] fatal:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
