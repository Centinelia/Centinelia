/**
 * Provider resolver para el catálogo — retorna un FilesConnector según el
 * provider elegido en la config. Aísla la selección para que lookup.ts no
 * conozca detalles OAuth de cada provider.
 */
import type { FilesConnector } from '@/lib/connectors/types';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { CatalogProvider } from './lookup';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function resolveFilesConnector(portalEmail: string, provider: CatalogProvider, supabase: SupabaseClient): Promise<{ files: FilesConnector } | { error: string }> {
  if (provider === 'dropbox') {
    const { getDropboxAccessToken } = await import('./lookup');
    const { createDropboxConnector } = await import('@/lib/connectors/dropbox');
    const token = await getDropboxAccessToken(portalEmail, supabase);
    if (!token) return { error: 'Dropbox no conectado o token invalido' };
    const conn = createDropboxConnector(token);
    return { files: conn.files };
  }

  // Google/Microsoft: usan integration_accounts capability='email' con provider gmail/outlook.
  // SCOPE WARNING (Fase 1, 2026-09-04): GMAIL_SCOPES ya no incluye drive.
  // Orgs que reconecten correo post-Fase-1 obtendrán token sin scope Drive y los
  // file searches del catálogo fallarán con 403. Fase 2 migra esto a un OAuth
  // separado (GOOGLE_SCOPES.drive) por empleado. Por ahora funciona para orgs
  // con tokens emitidos antes del 2026-09-04 (scope amplio).
  // El email connector viene con files gratis (Drive/OneDrive) solo si el token lo tiene.
  const expectedEmailProvider = provider === 'google' ? 'gmail' : 'outlook';
  const { data: orgAcct } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('capability', 'email')
    .eq('provider', expectedEmailProvider)
    .neq('status', 'disconnected')
    .maybeSingle();
  if (!orgAcct) return { error: `${provider} no conectado. Conecta ${expectedEmailProvider} desde el portal.` };

  // Refresh si expiró
  let accessToken = orgAcct.access_token as string;
  const expiresAt = orgAcct.expires_at ? new Date(orgAcct.expires_at as string) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh && orgAcct.refresh_token) {
    const { decrypt } = await import('@/lib/crypto');
    const plainRefresh = decrypt(orgAcct.refresh_token as string);
    const { gmailRefreshToken } = await import('@/lib/email/gmail');
    const { outlookRefreshToken } = await import('@/lib/email/outlook');
    try {
      const refreshed = provider === 'google'
        ? await gmailRefreshToken(plainRefresh)
        : await outlookRefreshToken(plainRefresh);
      accessToken = refreshed.access_token;
      await supabase.from('integration_accounts')
        .update({
          access_token: refreshed.access_token,
          expires_at:   new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          status:       'active',
        })
        .eq('portal_email', portalEmail)
        .eq('provider', expectedEmailProvider)
        .eq('capability', 'email');
    } catch (err) {
      return { error: `Refresh ${provider} falló: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  }

  if (provider === 'google') {
    const { createGoogleConnector } = await import('@/lib/connectors/google');
    return { files: createGoogleConnector(accessToken).files };
  }
  const { createMicrosoftConnector } = await import('@/lib/connectors/microsoft');
  return { files: createMicrosoftConnector(accessToken).files };
}
