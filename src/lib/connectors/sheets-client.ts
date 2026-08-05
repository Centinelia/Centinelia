import { google, sheets_v4 } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto';

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

  return google.sheets({ version: 'v4', auth: oauth2 });
}
