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
 * agentId = optional. Cuando se provee, primero busca email_integrations per-agent
 * (rows pre-Fase-1 con scope amplio que incluye spreadsheets). Fallback a
 * integration_accounts org-level capability='email' provider='gmail'.
 * Emite console.warn cuando cae al fallback legacy para medir dependencia.
 *
 * TODO Fase 3: cuando exista UI para capability='sheets_google' en integration_accounts,
 * agregar lookup per-agent por ese capability antes del email_integrations path.
 *
 * Throws 'sheets_no_conectado' when no active Google integration exists for the org.
 *
 * SCOPE WARNING (Fase 1, 2026-09-04): GMAIL_SCOPES ya no incluye spreadsheets.
 * Orgs que reconecten correo post-Fase-1 obtendrán token sin scope Sheets y este
 * helper fallará silenciosamente con 403. La solución es Fase 3: OAuth separado
 * para Google Sheets (GOOGLE_SCOPES.sheets) y lookup por (agent_id, capability='sheets_google').
 * Orgs con row antigua (scope amplio previo) siguen funcionando hasta que reconecten.
 * No hay runtime check de scopes aún — integration_accounts.scopes no existe.
 *
 * Callers (tools) are responsible for catching errors and shaping them into
 * { ok: false, reason } responses — this helper throws, does not return ok/error.
 */
export async function getSheetsClient(orgId: string, agentId?: string): Promise<sheets_v4.Sheets> {
  const supabase = createAdminClient();

  let accountData: { access_token: unknown; refresh_token: unknown; expires_at: unknown; status: unknown } | null = null;

  // 1. Per-agent email_integrations (OAuth Gmail/Outlook broad-scope, rows pre-Fase-1).
  //    Preferred cuando agentId disponible porque incluye spreadsheets scope.
  if (agentId) {
    const { data: perAgentEmail } = await supabase
      .from('email_integrations')
      .select('access_token, refresh_token, token_expires_at, needs_reauth')
      .eq('agent_id', agentId)
      .eq('provider', 'gmail')
      .maybeSingle();
    if (perAgentEmail) {
      accountData = {
        access_token:  perAgentEmail.access_token,
        refresh_token: perAgentEmail.refresh_token,
        expires_at:    perAgentEmail.token_expires_at,
        status:        perAgentEmail.needs_reauth ? 'needs_reauth' : 'active',
      };
    }
  }

  // 2. Fallback org-level integration_accounts capability='email' provider='gmail'.
  //    WARN: tokens emitidos post-2026-09-04 no tienen scope spreadsheets.
  if (!accountData) {
    if (agentId) {
      console.warn(`[sheets-client] agentId=${agentId} (orgId=${orgId}) sin email_integrations per-agent Gmail — cayendo a integration_accounts org-level. Tokens post-2026-09-04 no tienen scope Sheets.`);
    }
    const { data: orgAccount } = await supabase
      .from('integration_accounts')
      .select('access_token, refresh_token, expires_at, status')
      .eq('portal_email', orgId)
      .eq('provider', 'gmail')
      .neq('status', 'disconnected')
      .maybeSingle();
    accountData = orgAccount;
  }

  const account = accountData;
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
