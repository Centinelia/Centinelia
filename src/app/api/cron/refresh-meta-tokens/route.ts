export const dynamic = 'force-dynamic';
// Frecuencia: "0 3 * * *" — renueva tokens Meta que vencen en menos de 7 días.

import { defineCron, errorMessage } from '@/lib/cron/define-cron';

// Ventana: tokens que vencen en los próximos 7 días
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
// Tokens de larga duración: 60 días
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

// Meta Graph API version
const META_API_VERSION = 'v18.0';

export const GET = defineCron({
  name:        'navi-refresh-meta-tokens',
  maxDuration: 300,
  handler: async ({ supabase, now, log }) => {
    const windowEnd = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();

    // Cuentas Meta activas con tokens que vencen en menos de 7 días
    const { data: accounts, error: fetchErr } = await supabase
      .from('social_accounts')
      .select('id, portal_email, access_token, expires_at, status')
      .eq('provider', 'meta_instagram')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lt('expires_at', windowEnd);

    if (fetchErr) {
      throw new Error(`Error cargando cuentas: ${fetchErr.message}`);
    }

    const rows = accounts ?? [];
    let processed = 0;
    const errors: string[] = [];

    const appId     = process.env.META_APP_ID ?? '';
    const appSecret = process.env.META_APP_SECRET ?? '';

    for (const account of rows) {
      try {
        const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
        url.searchParams.set('grant_type',      'fb_exchange_token');
        url.searchParams.set('client_id',        appId);
        url.searchParams.set('client_secret',    appSecret);
        url.searchParams.set('fb_exchange_token', account.access_token as string);

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const body = await response.json() as { access_token?: string; error?: { message?: string } };
        if (body.error) {
          throw new Error(body.error.message ?? 'Error de Meta API');
        }
        if (!body.access_token) {
          throw new Error('Respuesta sin access_token');
        }

        const newExpiresAt = new Date(now.getTime() + SIXTY_DAYS_MS).toISOString();

        const { error: updateErr } = await supabase
          .from('social_accounts')
          .update({
            access_token: body.access_token,
            expires_at:   newExpiresAt,
          })
          .eq('id', account.id as string);

        if (updateErr) {
          throw new Error(`DB update: ${updateErr.message}`);
        }

        log.info(`Token renovado para cuenta ${account.id}`, { newExpiresAt });
        processed++;
      } catch (err) {
        // En fallo: marcar needs_reauth. El cliente lo verá en el portal (Task 12/13).
        const { error: reautErr } = await supabase
          .from('social_accounts')
          .update({ status: 'needs_reauth' })
          .eq('id', account.id as string);

        if (reautErr) {
          log.error(`Error marcando needs_reauth para ${account.id}`, { error: reautErr.message });
        }

        const msg = `${account.id}: ${errorMessage(err)}`;
        log.error('Error renovando token', { accountId: account.id, error: errorMessage(err) });
        errors.push(msg);
      }
    }

    return {
      expected:  rows.length,
      processed,
      errors,
      metadata:  { accounts_checked: rows.length, renewed: processed, needs_reauth: errors.length },
    };
  },
});
