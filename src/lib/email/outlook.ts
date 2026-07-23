const TENANT = 'common';
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;

export const OUTLOOK_SCOPES = 'Mail.ReadWrite Mail.Send Files.ReadWrite Calendars.ReadWrite Contacts.ReadWrite Tasks.ReadWrite offline_access User.Read';

function credentials() {
  const client_id     = process.env.MICROSOFT_CLIENT_ID;
  const client_secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error('MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not configured');
  }
  return { client_id, client_secret };
}

export function outlookAuthUrl(state: string): string {
  const { client_id } = credentials();
  const p = new URLSearchParams({
    client_id,
    response_type: 'code',
    redirect_uri:  callbackUrl('outlook'),
    scope:         OUTLOOK_SCOPES,
    response_mode: 'query',
    state,
  });
  return `${AUTH_BASE}/authorize?${p}`;
}

export async function outlookExchangeCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number; email: string;
}> {
  const { client_id, client_secret } = credentials();
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri:  callbackUrl('outlook'),
      grant_type:    'authorization_code',
      scope:         OUTLOOK_SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
  const data = await res.json();
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    email:         profile.mail ?? profile.userPrincipalName,
  };
}

export async function outlookRefreshToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
  const { client_id, client_secret } = credentials();
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      client_id,
      client_secret,
      grant_type:    'refresh_token',
      scope:         OUTLOOK_SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Outlook refresh failed: ${await res.text()}`);
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

function callbackUrl(_provider: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  return `${base}/api/auth/email-callback/outlook`;
}
