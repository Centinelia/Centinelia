/**
 * hydrate-refresh.ts — helper para inyectar el refresh_token de Dropbox al
 * config del adapter ANTES de invocar `buildAdapter`.
 *
 * Motivación: el access_token de Dropbox vive en `organization_integrations.
 * config.dropbox_token` con TTL de ~4h. El refresh_token vive en
 * `integration_accounts.refresh_token` (provider='dropbox'). Sin hidratación,
 * cuando el access expira, DropboxClient tira 401 y no puede renovar solo.
 *
 * Uso:
 *   const config = { ...row.config };
 *   await hydrateDropboxRefresh(config, portalEmail, supabase);
 *   const adapter = buildAdapter(config);
 *
 * Best-effort: si el refresh_token no existe (integración no OAuth, agente sin
 * conexión), no falla — simplemente el adapter no tendrá auto-refresh.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function hydrateDropboxRefresh(
  config:      Record<string, unknown>,
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<void> {
  // Solo aplica al adapter CONTPAQi con backend Dropbox. Otros tipos ignoran
  // las claves extra sin problema pero evitamos queries innecesarias.
  if (config['type'] !== 'contpaqi') return;
  if ((config['storage_backend'] ?? 'dropbox') !== 'dropbox') return;

  try {
    const { data: dbxAcct } = await supabase
      .from('integration_accounts')
      .select('refresh_token, access_token, capability')
      .eq('portal_email', portalEmail)
      .eq('provider', 'dropbox')
      .in('capability', ['files', 'storage_dropbox'])
      .limit(1)
      .maybeSingle<{ refresh_token: string | null; access_token: string | null; capability: string }>();

    if (!dbxAcct?.refresh_token) return;

    config['dropbox_refresh_token'] = dbxAcct.refresh_token;
    // Callback que persiste el nuevo access_token en integration_accounts
    // cuando DropboxClient hace refresh. Best-effort, no bloquea si falla.
    config['on_dropbox_refresh'] = async (newAccess: string) => {
      try {
        await supabase
          .from('integration_accounts')
          .update({ access_token: newAccess })
          .eq('portal_email', portalEmail)
          .eq('provider', 'dropbox')
          .eq('capability', dbxAcct.capability);
      } catch (persistErr) {
        console.warn(
          `[hydrateDropboxRefresh] persist refreshed access_token failed for ${portalEmail}: ${(persistErr as Error).message}`,
        );
      }
    };
  } catch (hydrateErr) {
    console.warn(
      `[hydrateDropboxRefresh] read integration_accounts failed for ${portalEmail}: ${(hydrateErr as Error).message}`,
    );
  }
}
