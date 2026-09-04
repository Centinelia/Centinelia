const GMAIL_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Scope sets separados por capability (Fase 1 per-agent, 2026-09-04).
// Gmail per-empleado se queda con scope mínimo de correo. Cal/Drive/Sheets
// se conectan como OAuths independientes desde la ficha del empleado.
const USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

export const GOOGLE_SCOPES = {
  email: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/contacts',
    USERINFO_EMAIL,
  ],
  calendar: [
    'https://www.googleapis.com/auth/calendar',
    USERINFO_EMAIL,
  ],
  drive: [
    'https://www.googleapis.com/auth/drive',
    USERINFO_EMAIL,
  ],
  sheets: [
    'https://www.googleapis.com/auth/spreadsheets',
    USERINFO_EMAIL,
  ],
} as const;

export type GoogleCapability = keyof typeof GOOGLE_SCOPES;

// Legacy: string monolítico que combinaba todo. Preservado para no romper
// email-callback existente + código externo que lo importe. Nuevas rutas usan
// googleAuthUrl con GOOGLE_SCOPES.email directamente.
export const GMAIL_SCOPES = GOOGLE_SCOPES.email.join(' ');

export function googleAuthUrl(
  state: string,
  scopes: readonly string[],
  callbackPath: string,
): string {
  const p = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  callbackUrl(callbackPath),
    response_type: 'code',
    scope:         scopes.join(' '),
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `${GMAIL_AUTH_URL}?${p}`;
}

export function gmailAuthUrl(state: string): string {
  return googleAuthUrl(state, GOOGLE_SCOPES.email, 'email-callback?provider=gmail');
}

export async function googleExchangeCode(
  code: string,
  callbackPath: string,
): Promise<{
  access_token: string; refresh_token: string; expires_in: number; email: string;
}> {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  callbackUrl(callbackPath),
      grant_type:    'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
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

export function gmailExchangeCode(code: string) {
  return googleExchangeCode(code, 'email-callback?provider=gmail');
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

// Alias exportado para uso desde rutas Cal/Drive per-agent — mismo endpoint,
// mismo mecanismo, distinto label.
export const googleRefreshToken = gmailRefreshToken;

function callbackUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  // path puede venir con query string ("email-callback?provider=gmail") o sin
  // ("auth/calendar-callback"). Se concatena tal cual al base.
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/api/auth/${clean}`;
}
