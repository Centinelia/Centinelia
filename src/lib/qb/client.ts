import { SupabaseClient } from '@supabase/supabase-js';

export interface QBClient {
  accessToken: string;
  realmId:     string;
  apiBase:     string;
  query:       (sql: string) => Promise<any>;
  get:         (path: string) => Promise<any>;
  post:        (path: string, body: unknown) => Promise<any>;
}

export async function getQBClient(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<QBClient | null> {
  const { data: qb } = await supabase
    .from('qb_integrations')
    .select('access_token, refresh_token, token_expires_at, realm_id')
    .eq('portal_email', portalEmail)
    .single();

  if (!qb) return null;

  let accessToken = qb.access_token as string;

  const expiresAt = new Date(qb.token_expires_at as string).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const creds = Buffer.from(
      `${process.env.INTUIT_CLIENT_ID}:${process.env.INTUIT_CLIENT_SECRET}`
    ).toString('base64');

    const refreshRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Accept':        'application/json',
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: qb.refresh_token as string,
      }),
    });

    if (!refreshRes.ok) return null;

    const { access_token, refresh_token, expires_in } = await refreshRes.json();
    const newExpires = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString();

    await supabase.from('qb_integrations').update({
      access_token,
      refresh_token,
      token_expires_at: newExpires,
      updated_at:       new Date().toISOString(),
    }).eq('portal_email', portalEmail);

    accessToken = access_token as string;
  }

  const apiBase = process.env.INTUIT_SANDBOX === '1'
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${qb.realm_id}`
    : `https://quickbooks.api.intuit.com/v3/company/${qb.realm_id}`;

  const headers = () => ({
    'Authorization': `Bearer ${accessToken}`,
    'Accept':        'application/json',
    'Content-Type':  'application/json',
  });

  return {
    accessToken,
    realmId: qb.realm_id as string,
    apiBase,

    async query(sql: string) {
      const res = await fetch(
        `${apiBase}/query?query=${encodeURIComponent(sql)}&minorversion=65`,
        { headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' } },
      );
      if (!res.ok) throw new Error(`QB query failed: ${res.status}`);
      return res.json();
    },

    async get(path: string) {
      const res = await fetch(`${apiBase}${path}?minorversion=65`, { headers: headers() });
      if (!res.ok) throw new Error(`QB GET ${path} failed: ${res.status}`);
      return res.json();
    },

    async post(path: string, body: unknown) {
      const res = await fetch(`${apiBase}${path}?minorversion=65`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`QB POST ${path} failed: ${res.status} ${text}`);
      }
      return res.json();
    },
  };
}
