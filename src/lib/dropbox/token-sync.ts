/**
 * Puente Dropbox: `integration_accounts` (portal OAuth) →
 * `organization_integrations.config.dropbox_token` (pipeline Nala).
 *
 * Contexto: los dos storages evolucionaron por separado. El portal guarda
 * access_token plaintext + refresh_token encriptado + expires_at (~4h). El
 * adapter CONTPAQi lee un solo token encriptado sin refresh. Esta lib
 * puentea ambos con refresh automático hasta que refactoreemos el adapter.
 *
 * Consumers:
 *   - scripts/sync-dropbox-token-to-billing.ts (uso manual / debug).
 *   - /api/cron/sync-dropbox-tokens (rotación automática cada 3h).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptDropboxToken } from '@/lib/billing/adapters';
import { dropboxRefreshToken } from '@/lib/dropbox/oauth';
import { decrypt } from '@/lib/crypto';

/** Renueva si el token expira en menos de este margen. */
export const REFRESH_MARGIN_MS = 15 * 60 * 1000;

export type SyncOutcome =
  | 'ok'
  | 'skip-no-dropbox'
  | 'skip-no-contpaqi'
  | 'error';

export interface SyncResult {
  portal_email: string;
  outcome:      SyncOutcome;
  refreshed:    boolean;
  expires_at:   string | null;
  error?:       string;
}

interface IntegrationAccountRow {
  portal_email:  string;
  access_token:  string;
  refresh_token: string;
  expires_at:    string | null;
}

/**
 * Sincroniza el token de un solo cliente. Idempotente: si el token en
 * `integration_accounts` sigue vigente, solo lo re-encripta y lo escribe a
 * `organization_integrations` (barato). Si está próximo a expirar, refresca.
 */
export async function syncTokenFor(
  portalEmail: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<SyncResult> {
  const base = { portal_email: portalEmail, refreshed: false, expires_at: null as string | null };

  const { data: acct, error: acctErr } = await supabase
    .from('integration_accounts')
    .select('portal_email, access_token, refresh_token, expires_at')
    .eq('portal_email', portalEmail)
    .eq('provider', 'dropbox')
    .maybeSingle<IntegrationAccountRow>();

  if (acctErr) return { ...base, outcome: 'error', error: `integration_accounts: ${acctErr.message}` };
  if (!acct)   return { ...base, outcome: 'skip-no-dropbox' };

  const { data: orgInt, error: orgErr } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ config: Record<string, unknown> | null }>();

  if (orgErr) return { ...base, outcome: 'error', error: `organization_integrations: ${orgErr.message}` };
  if (!orgInt) return { ...base, outcome: 'skip-no-contpaqi' };

  let accessToken = acct.access_token;
  let expiresAt   = acct.expires_at;
  let refreshed   = false;

  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const needsRefresh = !expiresAtMs || Date.now() + REFRESH_MARGIN_MS >= expiresAtMs;

  if (needsRefresh) {
    try {
      const refreshPlain = decrypt(acct.refresh_token);
      const fresh = await dropboxRefreshToken(refreshPlain);
      accessToken = fresh.access_token;
      expiresAt   = new Date(Date.now() + fresh.expires_in * 1000).toISOString();
      refreshed   = true;

      const { error: updErr } = await supabase
        .from('integration_accounts')
        .update({ access_token: accessToken, expires_at: expiresAt })
        .eq('portal_email', portalEmail)
        .eq('provider', 'dropbox');
      if (updErr) return { ...base, outcome: 'error', error: `refresh-write: ${updErr.message}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ...base, outcome: 'error', error: `refresh: ${msg}` };
    }
  }

  const encryptedForBilling = encryptDropboxToken(accessToken);
  const nextConfig = { ...(orgInt.config ?? {}), dropbox_token: encryptedForBilling };

  const { error: writeErr } = await supabase
    .from('organization_integrations')
    .update({ config: nextConfig })
    .eq('portal_email', portalEmail)
    .eq('type', 'contpaqi');

  if (writeErr) return { ...base, outcome: 'error', error: `billing-write: ${writeErr.message}` };

  return { portal_email: portalEmail, outcome: 'ok', refreshed, expires_at: expiresAt };
}

/**
 * Sincroniza todos los clientes con integración Dropbox activa Y contpaqi
 * configurada. Usado por el cron.
 */
export async function syncAllActiveTokens(
  supabase: SupabaseClient = createAdminClient(),
): Promise<{ results: SyncResult[]; summary: { ok: number; skip: number; error: number } }> {
  const { data: rows, error } = await supabase
    .from('integration_accounts')
    .select('portal_email')
    .eq('provider', 'dropbox')
    .eq('status', 'active');

  if (error) throw new Error(`listando cuentas Dropbox: ${error.message}`);

  const emails = Array.from(new Set(
    (rows ?? []).map(r => r.portal_email).filter((e): e is string => !!e)
  ));

  const results: SyncResult[] = [];
  for (const em of emails) {
    results.push(await syncTokenFor(em, supabase));
  }

  const summary = results.reduce(
    (acc, r) => {
      if (r.outcome === 'ok') acc.ok++;
      else if (r.outcome === 'error') acc.error++;
      else acc.skip++;
      return acc;
    },
    { ok: 0, skip: 0, error: 0 },
  );

  return { results, summary };
}
