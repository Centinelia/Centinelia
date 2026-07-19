import { createAdminClient } from '@/lib/supabase/admin';
import { mlRefreshToken } from '@/lib/mercadolibre/auth';
import { createMercadoLibreConnector, type MercadoLibreConnector } from '@/lib/connectors/mercadolibre';
import { decrypt, encrypt } from '@/lib/crypto';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function getMlConnectorByPortalEmail(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<MercadoLibreConnector | null> {
  const { data } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, metadata')
    .eq('portal_email', portalEmail)
    .eq('provider', 'mercadolibre')
    .eq('status', 'active')
    .maybeSingle();

  if (!data) return null;

  const userId = (data.metadata as { user_id?: string })?.user_id ?? '';

  const expiresAt    = data.expires_at ? new Date(data.expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  let accessToken = data.access_token as string;

  if (needsRefresh && data.refresh_token) {
    try {
      const plain     = decrypt(data.refresh_token as string);
      const refreshed = await mlRefreshToken(plain);
      accessToken     = refreshed.access_token;
      await supabase.from('integration_accounts').update({
        access_token:  refreshed.access_token,
        refresh_token: encrypt(refreshed.refresh_token),
        expires_at:    new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('portal_email', portalEmail).eq('provider', 'mercadolibre');
    } catch { /* use existing token */ }
  }

  return createMercadoLibreConnector(accessToken, userId);
}

export async function getMlConnectorByToken(
  portalToken: string,
  supabase: SupabaseClient,
): Promise<{ connector: MercadoLibreConnector; portalEmail: string } | null> {
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', portalToken)
    .single();

  if (!agent?.portal_email) return null;

  const connector = await getMlConnectorByPortalEmail(agent.portal_email, supabase);
  if (!connector) return null;

  return { connector, portalEmail: agent.portal_email };
}
