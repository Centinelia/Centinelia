const TENANT    = 'common';
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;

export const OUTLOOK_SCOPES = 'Mail.Read Mail.Send Files.ReadWrite offline_access User.Read';

export function outlookAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID!,
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
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
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
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      client_id:     process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type:    'refresh_token',
      scope:         OUTLOOK_SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Outlook refresh failed: ${await res.text()}`);
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

function callbackUrl(provider: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  return `${base}/api/auth/email-callback?provider=${provider}`;
}
