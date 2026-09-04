const TENANT = 'common';
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;

// Scope sets separados por capability (Fase 1 per-agent, 2026-09-04).
// Outlook per-empleado se queda con scope mínimo de correo. Calendar/OneDrive
// se conectan como OAuths independientes desde la ficha del empleado.
const MS_BASE = ['offline_access', 'User.Read'];

export const MICROSOFT_SCOPES = {
  email:    [...MS_BASE, 'Mail.ReadWrite', 'Mail.Send', 'Contacts.ReadWrite'],
  calendar: [...MS_BASE, 'Calendars.ReadWrite'],
  drive:    [...MS_BASE, 'Files.ReadWrite'],
} as const;

export type MicrosoftCapability = keyof typeof MICROSOFT_SCOPES;

// Legacy: string monolítico con todo. Preservado para no romper callback
// existente. Nuevas rutas usan microsoftAuthUrl con scopes específicos.
export const OUTLOOK_SCOPES = MICROSOFT_SCOPES.email.join(' ');

function credentials() {
  const client_id     = process.env.MICROSOFT_CLIENT_ID;
  const client_secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    throw new Error('MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not configured');
  }
  return { client_id, client_secret };
}

export function microsoftAuthUrl(
  state: string,
  scopes: readonly string[],
  callbackPath: string,
): string {
  const { client_id } = credentials();
  const p = new URLSearchParams({
    client_id,
    response_type: 'code',
    redirect_uri:  callbackUrl(callbackPath),
    scope:         scopes.join(' '),
    response_mode: 'query',
    state,
  });
  return `${AUTH_BASE}/authorize?${p}`;
}

export function outlookAuthUrl(state: string): string {
  return microsoftAuthUrl(state, MICROSOFT_SCOPES.email, 'email-callback/outlook');
}

export async function microsoftExchangeCode(
  code: string,
  scopes: readonly string[],
  callbackPath: string,
): Promise<{
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
      redirect_uri:  callbackUrl(callbackPath),
      grant_type:    'authorization_code',
      scope:         scopes.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await res.text()}`);
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

export function outlookExchangeCode(code: string) {
  return microsoftExchangeCode(code, MICROSOFT_SCOPES.email, 'email-callback/outlook');
}

export async function microsoftRefreshToken(
  refresh_token: string,
  scopes: readonly string[],
): Promise<{ access_token: string; expires_in: number }> {
  const { client_id, client_secret } = credentials();
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token,
      client_id,
      client_secret,
      grant_type:    'refresh_token',
      scope:         scopes.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`Microsoft refresh failed: ${await res.text()}`);
  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export function outlookRefreshToken(refresh_token: string) {
  return microsoftRefreshToken(refresh_token, MICROSOFT_SCOPES.email);
}

function callbackUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/api/auth/${clean}`;
}
