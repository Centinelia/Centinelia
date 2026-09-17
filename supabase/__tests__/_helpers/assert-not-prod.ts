/**
 * Guard para smoke integration tests que INSERTAN filas reales en Supabase.
 *
 * Aborta el test si NEXT_PUBLIC_SUPABASE_URL parece apuntar a prod y no está seteado
 * ALLOW_SMOKE_ON_PROD_DB=1. Previene el incidente 2026-09-17 (23 filas smoke
 * huérfanas en prod tras afterAll fallido → cron refresh-social-metrics gritó
 * [CRITICO] cada hora hasta cleanup manual).
 *
 * Uso: llamar como PRIMERA línea del beforeAll de todo smoke que inserte data.
 */
export function assertNotProdOrAllowed(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('SMOKE ABORT: NEXT_PUBLIC_SUPABASE_URL no configurado.');
  }

  const isLocal   = url.includes('localhost') || url.includes('127.0.0.1');
  const isStaging = url.includes('staging') || url.includes('-test') || url.includes('.local');
  const allowProd = process.env.ALLOW_SMOKE_ON_PROD_DB === '1';

  if (isLocal || isStaging || allowProd) return;

  throw new Error(
    `SMOKE ABORT: NEXT_PUBLIC_SUPABASE_URL parece apuntar a prod (${url}).\n` +
    `  El smoke inserta filas reales en Supabase; si afterAll falla, quedan huérfanas.\n` +
    `  Para correr contra prod a propósito: ALLOW_SMOKE_ON_PROD_DB=1 pnpm test:smoke\n` +
    `  Ref: incidente 2026-09-17 — 23 filas smoke leftover generaron alertas [CRITICO] hourly.`,
  );
}
