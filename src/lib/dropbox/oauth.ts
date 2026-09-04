/**
 * Dropbox OAuth 2.0 helpers.
 *
 * El cliente conecta SU cuenta Dropbox via portal (integraciones). Guardamos
 * access_token + refresh_token en integration_accounts (provider='dropbox',
 * capability='files'). Refresh es standard OAuth2.
 *
 * Scopes solicitados: solo lectura del catálogo (files.content.read +
 * files.metadata.read + account_info.read para labelizar la conexión).
 * Sin scopes de escritura porque el pack dropbox_catalog es lookup-only.
 */
const DROPBOX_AUTH_URL   = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL  = 'https://api.dropboxapi.com/oauth2/token';
const DROPBOX_ACCOUNT_URL = 'https://api.dropboxapi.com/2/users/get_current_account';

export const DROPBOX_SCOPES = [
  'files.content.read',
  'files.metadata.read',
  'account_info.read',
].join(' ');

export function dropboxAuthUrl(state: string, callbackPath?: string): string {
  const p = new URLSearchParams({
    client_id:          process.env.DROPBOX_APP_KEY!,
    redirect_uri:       callbackUrl(callbackPath),
    response_type:      'code',
    token_access_type:  'offline',
    scope:              DROPBOX_SCOPES,
    state,
  });
  return `${DROPBOX_AUTH_URL}?${p}`;
}

export async function dropboxExchangeCode(code: string, callbackPath?: string): Promise<{
  access_token: string; refresh_token: string | undefined; expires_in: number; email: string;
}> {
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      grant_type:    'authorization_code',
      client_id:     process.env.DROPBOX_APP_KEY!,
      client_secret: process.env.DROPBOX_APP_SECRET!,
      redirect_uri:  callbackUrl(callbackPath),
    }),
  });
  if (!res.ok) throw new Error(`Dropbox token exchange failed: ${await res.text()}`);
  const data = await res.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };
  const email = await getAccountEmail(data.access_token);
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    email,
  };
}

export async function dropboxRefreshToken(refresh_token: string): Promise<{
  access_token: string; expires_in: number;
}> {
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      grant_type:    'refresh_token',
      client_id:     process.env.DROPBOX_APP_KEY!,
      client_secret: process.env.DROPBOX_APP_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  return { access_token: data.access_token, expires_in: data.expires_in };
}

async function getAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(DROPBOX_ACCOUNT_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Dropbox get_current_account failed: ${await res.text()}`);
  const data = await res.json() as { email: string };
  return data.email;
}

function callbackUrl(path?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  if (!path) return `${base}/api/auth/dropbox-callback`;
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/api/auth/${clean}`;
}
