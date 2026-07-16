const ML_AUTH = 'https://auth.mercadolibre.com.mx/authorization';
const ML_TOKEN = 'https://api.mercadolibre.com/oauth/token';
const ML_API   = 'https://api.mercadolibre.com';

export function mlAuthUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.ML_CLIENT_ID!,
    redirect_uri:  callbackUrl(),
    state,
  });
  return `${ML_AUTH}?${p}`;
}

export async function mlExchangeCode(code: string): Promise<{
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  user_id:       number;
  nickname:      string;
}> {
  const res = await fetch(ML_TOKEN, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      redirect_uri:  callbackUrl(),
      code,
    }),
  });
  if (!res.ok) throw new Error(`ML token exchange failed: ${await res.text()}`);
  const data = await res.json();

  const profile = await fetch(`${ML_API}/users/me`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  }).then(r => r.json());

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    user_id:       profile.id,
    nickname:      profile.nickname ?? profile.email ?? String(profile.id),
  };
}

export async function mlRefreshToken(refresh_token: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(ML_TOKEN, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`ML refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? refresh_token,
    expires_in:    data.expires_in,
  };
}

function callbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  return `${base}/api/auth/ml-callback`;
}
