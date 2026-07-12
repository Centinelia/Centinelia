const GMAIL_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/contacts.readonly',
].join(' ');

export function gmailAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  callbackUrl('gmail'),
    response_type: 'code',
    scope:         GMAIL_SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `${GMAIL_AUTH_URL}?${p}`;
}

export async function gmailExchangeCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number; email: string;
}> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  callbackUrl('gmail'),
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Gmail token exchange failed: ${await res.text()}`);
  const data = await res.json();
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    email:         profile.email,
  };
}

export async function gmailRefreshToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Gmail refresh failed: ${await res.text()}`);
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

function callbackUrl(provider: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  return `${base}/api/auth/email-callback?provider=${provider}`;
}
