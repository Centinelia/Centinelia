/**
 * Provider resolver para el catálogo — retorna un FilesConnector según el
 * provider elegido en la config. Aísla la selección para que lookup.ts no
 * conozca detalles OAuth de cada provider.
 *
 * Orden de resolución (Fase 2, 2026-09-04):
 *   1. Per-agent storage capability (integration_accounts agent_id + capability
 *      storage_google / storage_microsoft / storage_dropbox). Token tiene scope exacto.
 *   2. Fallback org-level capability='email' (scope amplio pre-Fase-1). Emite
 *      console.warn para medir cuántas orgs siguen en este path legacy.
 *
 * Signature mantiene retrocompat — agentId es opcional. Cuando no se provee
 * (callers viejos), salta directo al fallback org-level.
 */
import type { FilesConnector } from '@/lib/connectors/types';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { CatalogProvider } from './lookup';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function resolveFilesConnector(
  portalEmail: string,
  provider:    CatalogProvider,
  supabase:    SupabaseClient,
  agentId?:    string,
): Promise<{ files: FilesConnector } | { error: string }> {

  // ── 1. Dropbox: per-agent capability si agentId disponible, else org-level ──
  if (provider === 'dropbox') {
    // 1a. Per-agent storage_dropbox
    if (agentId) {
      const { data: perAgentDbx } = await supabase
        .from('integration_accounts')
        .select('access_token, refresh_token, expires_at, status')
        .eq('agent_id', agentId)
        .eq('capability', 'storage_dropbox')
        .neq('status', 'disconnected')
        .maybeSingle();
      if (perAgentDbx) {
        const { decrypt } = await import('@/lib/crypto');
        const { createDropboxConnector } = await import('@/lib/connectors/dropbox');
        const { dropboxRefreshToken } = await import('@/lib/dropbox/oauth');
        let token = perAgentDbx.access_token ? decrypt(perAgentDbx.access_token as string) : '';
        const expiresAt = perAgentDbx.expires_at ? new Date(perAgentDbx.expires_at as string) : null;
        const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
        if (needsRefresh && perAgentDbx.refresh_token) {
          try {
            const plainRefresh = decrypt(perAgentDbx.refresh_token as string);
            const refreshed = await dropboxRefreshToken(plainRefresh);
            token = refreshed.access_token;
            await supabase.from('integration_accounts')
              .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
              .eq('agent_id', agentId)
              .eq('capability', 'storage_dropbox');
          } catch { /* fall through with current token */ }
        }
        if (!token) return { error: 'Dropbox per-agent sin token válido' };
        const conn = createDropboxConnector(token);
        return { files: conn.files };
      }
    }
    // 1b. Legacy org-level Dropbox
    const { getDropboxAccessToken } = await import('./lookup');
    const { createDropboxConnector } = await import('@/lib/connectors/dropbox');
    if (agentId) {
      console.warn(`[catalog/providers] agentId=${agentId} usando Dropbox org-level (capability='files') como fallback. Conecta storage_dropbox per-agent para resolver.`);
    }
    const token = await getDropboxAccessToken(portalEmail, supabase);
    if (!token) return { error: 'Dropbox no conectado o token invalido' };
    const conn = createDropboxConnector(token);
    return { files: conn.files };
  }

  // ── 2. Google / Microsoft ─────────────────────────────────────────────────
  const expectedStorageCap = provider === 'google' ? 'storage_google' : 'storage_microsoft';
  const expectedEmailProvider = provider === 'google' ? 'gmail' : 'outlook';

  // 2a. Per-agent storage capability (Fase 2, scope exacto)
  if (agentId) {
    const { data: perAgentAcct } = await supabase
      .from('integration_accounts')
      .select('access_token, refresh_token, expires_at, status')
      .eq('agent_id', agentId)
      .eq('capability', expectedStorageCap)
      .neq('status', 'disconnected')
      .maybeSingle();

    if (perAgentAcct) {
      const { decrypt } = await import('@/lib/crypto');
      let accessToken = perAgentAcct.access_token ? decrypt(perAgentAcct.access_token as string) : '';
      const expiresAt = perAgentAcct.expires_at ? new Date(perAgentAcct.expires_at as string) : null;
      const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
      if (needsRefresh && perAgentAcct.refresh_token) {
        const { gmailRefreshToken } = await import('@/lib/email/gmail');
        const { outlookRefreshToken } = await import('@/lib/email/outlook');
        try {
          const plainRefresh = decrypt(perAgentAcct.refresh_token as string);
          const refreshed = provider === 'google'
            ? await gmailRefreshToken(plainRefresh)
            : await outlookRefreshToken(plainRefresh);
          accessToken = refreshed.access_token;
          await supabase.from('integration_accounts')
            .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
            .eq('agent_id', agentId)
            .eq('capability', expectedStorageCap);
        } catch (err) {
          return { error: `Refresh ${provider} per-agent falló: ${err instanceof Error ? err.message : 'unknown'}` };
        }
      }
      if (provider === 'google') {
        const { createGoogleConnector } = await import('@/lib/connectors/google');
        return { files: createGoogleConnector(accessToken).files };
      }
      const { createMicrosoftConnector } = await import('@/lib/connectors/microsoft');
      return { files: createMicrosoftConnector(accessToken).files };
    }
  }

  // 2b. Fallback org-level capability='email' (scope amplio pre-Fase-1).
  //     WARN: orgs que reconecten correo post-2026-09-04 obtienen scope estrecho
  //     y fallarán con 403 en Drive/OneDrive. Migrar a per-agent storage capability.
  console.warn(`[catalog/providers] ${agentId ? `agentId=${agentId}` : `portalEmail=${portalEmail}`} usando fallback org-level capability='email' para ${provider}. Orgs reconectadas post-2026-09-04 fallarán con 403 en Files. Conecta storage per-agent.`);

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
