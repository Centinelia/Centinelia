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

    if (!refreshRes.ok) {
      // Diferenciar 401 (refresh token expiró — 101 días de inactividad) del
      // resto (500 transient de Intuit, red caída). Solo el primero requiere
      // re-auth manual del owner. Ver Scope C1 CRIT #4.
      const text = await refreshRes.text().catch(() => '');
      const isAuthExpired = refreshRes.status === 400 || refreshRes.status === 401
        || /invalid_grant|invalid_token/i.test(text);
      if (isAuthExpired) {
        // Marca la integración y dispara notificación (idempotente por flag).
        await supabase.from('qb_integrations').update({
          needs_reauth:            true,
          needs_reauth_notified_at: null,
          updated_at:              new Date().toISOString(),
        }).eq('portal_email', portalEmail);
        // Notificar al owner una sola vez por evento de expiración.
        await notifyQbReauthNeeded(portalEmail, supabase).catch(err =>
          console.error('[qb] notifyQbReauthNeeded failed:', err),
        );
      } else {
        console.error(`[qb] refresh_token failed (transient?) HTTP ${refreshRes.status}: ${text.slice(0, 300)}`);
      }
      return null;
    }

    const { access_token, refresh_token, expires_in } = await refreshRes.json();
    const newExpires = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString();

    // Refresh exitoso — limpia needs_reauth por si estaba puesto de un
    // intento previo transient (self-heal).
    await supabase.from('qb_integrations').update({
      access_token,
      refresh_token,
      token_expires_at: newExpires,
      needs_reauth:     false,
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

/**
 * Notifica al owner una sola vez que QB necesita re-auth (refresh_token
 * expiró tras 101 días de inactividad, o revocado desde el Intuit dashboard).
 * Deja platform_incident para audit + envía email al portal_email.
 * Idempotente: usa needs_reauth_notified_at para no re-notificar cada refresh.
 */
async function notifyQbReauthNeeded(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: intg } = await supabase
    .from('qb_integrations')
    .select('needs_reauth_notified_at')
    .eq('portal_email', portalEmail)
    .maybeSingle() as { data: { needs_reauth_notified_at: string | null } | null };
  if (intg?.needs_reauth_notified_at) return; // ya notificado

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const { data: org } = await supabase
    .from('organizations')
    .select('portal_token, business_email')
    .eq('portal_email', portalEmail)
    .maybeSingle() as { data: { portal_token: string | null; business_email: string | null } | null };
  const reauthUrl = org?.portal_token
    ? `${appUrl}/portal/${org.portal_token}/configurar#integraciones`
    : `${appUrl}/portal`;

  await supabase.from('platform_incidents').insert({
    source:                'qb_reauth_expired',
    source_id:             `qb_${portalEmail}`,
    title:                 'QuickBooks: re-autorización requerida',
    description:           `El refresh_token expiró (101 días sin uso) o el owner revocó acceso. Todas las tools qb_* devolverán "QuickBooks no está conectado" hasta re-auth. Link: ${reauthUrl}`,
    priority:              'high',
    status:                'open',
    assigned_to:           'owner',
    affected_portal_email: portalEmail,
    metadata:              { reauth_url: reauthUrl },
  });

  const emailTo = org?.business_email ?? portalEmail;
  try {
    const { sendEmail, shell, heading, badge, btn } = await import('@/lib/email/send');
    await sendEmail({
      to:      emailTo,
      subject: 'Reconecta QuickBooks en Centinelia',
      html:    shell(`
        ${badge('Acción requerida', '#FF6B6B')}
        ${heading('QuickBooks perdió la conexión')}
        <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">
          El acceso de tu empleado digital a QuickBooks expiró (Intuit exige re-autorizar cada 101 días de inactividad). Mientras no reconectes, tus empleados no podrán consultar facturas ni registrar pagos por voz o chat.
        </p>
        ${btn('Reconectar QuickBooks →', reauthUrl)}
      `),
    });
  } catch (err) {
    console.error('[qb notify] send email failed:', err);
  }

  await supabase
    .from('qb_integrations')
    .update({ needs_reauth_notified_at: new Date().toISOString() })
    .eq('portal_email', portalEmail);
}
