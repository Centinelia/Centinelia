import { google, sheets_v4 } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt, encrypt } from '@/lib/crypto';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/**
 * Returns an authenticated Google Sheets v4 client for the given org.
 *
 * orgId = portal_email (primary key of organizations table, used as org identifier
 * throughout this codebase).
 *
 * Throws 'sheets_no_conectado' when no active Google integration exists for the org.
 *
 * Scope enforcement lives at OAuth grant time (GMAIL_SCOPES); no runtime check
 * until integration_accounts.scopes is added.
 *
 * Callers (tools) are responsible for catching errors and shaping them into
 * { ok: false, reason } responses — this helper throws, does not return ok/error.
 */
export async function getSheetsClient(orgId: string): Promise<sheets_v4.Sheets> {
  const supabase = createAdminClient();

  const { data: account } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', orgId)
    .eq('provider', 'gmail')
    .neq('status', 'disconnected')
    .maybeSingle();

  if (!account) {
    throw new Error('sheets_no_conectado');
  }

  const accessToken  = account.access_token  ? decrypt(account.access_token  as string) : '';
  const refreshToken = account.refresh_token ? decrypt(account.refresh_token as string) : null;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2.setCredentials({
    access_token:  accessToken  || undefined,
    refresh_token: refreshToken || undefined,
  });

  // I-1: Persist googleapis auto-refreshed tokens back to integration_accounts so
  // every call after token expiry does not burn an extra refresh round-trip.
  oauth2.on('tokens', async (tokens) => {
    if (!tokens.access_token) return;
    try {
      const sb = createAdminClient();
      await sb
        .from('integration_accounts')
        .update({
          access_token: encrypt(tokens.access_token),
          expires_at:   tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          status: 'active',
        })
        .eq('portal_email', orgId)
        .eq('provider', 'gmail');
    } catch {
      // Swallow — persistence failure must not break the sheets call
    }
  });

  return google.sheets({ version: 'v4', auth: oauth2 });
}

/**
 * Translates known Google OAuth error codes into cleaner error strings and
 * marks the integration account as needing re-auth when the refresh_token
 * has been revoked (`invalid_grant`).
 *
 * Must be called from every Sheets service helper that catches googleapis
 * errors (or from getSheetsClient callers).
 */
export async function translateGoogleError(
  err: unknown,
  orgId: string,
): Promise<never> {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('invalid_grant')) {
    // Mark the integration as needing re-auth (best-effort; never throws)
    try {
      const sb = createAdminClient();
      await sb
        .from('integration_accounts')
        .update({ status: 'needs_reauth' })
        .eq('portal_email', orgId)
        .eq('provider', 'gmail');
    } catch {
      // Swallow
    }
    throw new Error('auth_expired');
  }
  throw err instanceof Error ? err : new Error(msg);
}
