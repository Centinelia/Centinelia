import type { createAdminClient } from '@/lib/supabase/admin';
import { getConnector, type IntegrationRow, type Connector } from '@/lib/connectors';
import { SUPPORT_EMAIL, SUPPORT_WA } from '@/lib/constants';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const NO_DRIVE_ERROR = `No tienes Google Drive ni OneDrive conectado. Conéctalo desde el portal en Integraciones → Correo. Si necesitas ayuda para configurar la integración, contacta a Centinelia: ${SUPPORT_EMAIL} o WhatsApp ${SUPPORT_WA}.`;

/**
 * Resuelve el connector de archivos/correo del meerkat en orden:
 *
 * 1. Legacy `email_integrations` per-agent (una row por agent_id).
 * 2. Fallback org-level `integration_accounts` con capability='email' — cualquier
 *    agente hereda el email conectado por su portal.
 *    SCOPE WARNING (Fase 1, 2026-09-04): GMAIL_SCOPES ya no incluye drive/calendar.
 *    Orgs que reconecten post-Fase-1 no tendrán access para Files/Calendar desde
 *    este fallback. Fase 2 migra a integration_accounts per-agent por capability.
 * 3. Fallback secundario: Dropbox conectado standalone como file provider.
 *    Retorna Connector minimal con solo `.files` (sin email/contacts/calendar).
 *
 * Retorna `null` si no hay ninguno.
 *
 * **Uso**: dispararlo cuando necesites saber si el meerkat puede mandar correos
 * por OAuth (Gmail/Outlook) o si estará forzado a usar Resend. Los callers
 * típicos son `sendMeerkatHtmlEmail` (routing outbound) y `executeSendEmail`
 * (tool general `enviar_correo`).
 */
export async function getFileConnector(agentId: string, supabase: SupabaseClient): Promise<{
  integration: IntegrationRow;
  conn:        Connector;
} | null> {
  // 0. SMTP per-agent (Fase 1 outbound) — vive en voice_agents.features.smtp_config.
  //    Se prefiere sobre OAuth per-agent porque, si el cliente configuró SMTP
  //    para este empleado específicamente, es señal de que quiere que salga
  //    desde su servidor real (no desde otra cuenta Google/Microsoft).
  const { data: agentSmtpRow } = await supabase
    .from('voice_agents')
    .select('features, portal_email')
    .eq('id', agentId)
    .maybeSingle();
  const smtpCfg = (agentSmtpRow as { features?: Record<string, unknown> | null } | null)?.features?.['smtp_config'] as
    | { host?: string; port?: number; secure?: boolean; username?: string; password_enc?: string; from_display?: string | null; tls_insecure?: boolean }
    | undefined;
  if (smtpCfg?.host && smtpCfg.username && smtpCfg.password_enc) {
    const { decrypt } = await import('@/lib/crypto');
    const { createImapSmtpConnector } = await import('@/lib/connectors/imap-smtp');
    const conn = createImapSmtpConnector({
      host:        String(smtpCfg.host),
      port:        Number(smtpCfg.port ?? 465),
      secure:      Boolean(smtpCfg.secure ?? true),
      username:    String(smtpCfg.username),
      password:    decrypt(smtpCfg.password_enc),
      fromDisplay: smtpCfg.from_display ?? undefined,
      tlsInsecure: smtpCfg.tls_insecure === true,
    });
    const synthetic: IntegrationRow = {
      id:                 `agent:${agentId}:imap_smtp`,
      agent_id:           agentId,
      provider:           'outlook' as const, // shape compat — solo se lee .email.send
      email:              String(smtpCfg.username),
      access_token:       '',
      refresh_token:      null,
      token_expires_at:   null,
      last_sync_at:       null,
      needs_reauth:       false,
      reauth_notified_at: null,
    };
    return { integration: synthetic, conn };
  }

  // 1. Legacy path — email_integrations per-agent (OAuth Gmail/Outlook broad-scope)
  const { data } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agentId)
    .single();
  if (data) {
    const conn = await getConnector(data as IntegrationRow, supabase);
    return { integration: data as IntegrationRow, conn };
  }

  // 1.5 Per-agent storage capability — Fase 2. Lookup en integration_accounts
  //     con agent_id IS NOT NULL y capability IN storage_google/microsoft/dropbox.
  //     Preferred sobre el fallback org-level porque el token tiene scope exacto.
  const storageCapabilities = ['storage_google', 'storage_microsoft', 'storage_dropbox'] as const;
  const { data: perAgentStorage } = await supabase
    .from('integration_accounts')
    .select('provider, account_label, access_token, refresh_token, expires_at, status, metadata, capability')
    .eq('agent_id', agentId)
    .in('capability', [...storageCapabilities])
    .neq('status', 'disconnected')
    .maybeSingle();

  if (perAgentStorage) {
    const { decrypt: dec } = await import('@/lib/crypto');
    const rawAccess = perAgentStorage.access_token ? dec(perAgentStorage.access_token as string) : '';

    // Refresh if near expiry
    let accessToken = rawAccess;
    const expiresAt = perAgentStorage.expires_at ? new Date(perAgentStorage.expires_at as string) : null;
    const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
    if (needsRefresh && perAgentStorage.refresh_token) {
      try {
        const plainRefresh = dec(perAgentStorage.refresh_token as string);
        const cap = perAgentStorage.capability as string;
        if (cap === 'storage_google') {
          const { gmailRefreshToken } = await import('@/lib/email/gmail');
          const refreshed = await gmailRefreshToken(plainRefresh);
          accessToken = refreshed.access_token;
          await supabase.from('integration_accounts')
            .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
            .eq('agent_id', agentId)
            .eq('capability', cap);
        } else if (cap === 'storage_microsoft') {
          const { outlookRefreshToken } = await import('@/lib/email/outlook');
          const refreshed = await outlookRefreshToken(plainRefresh);
          accessToken = refreshed.access_token;
          await supabase.from('integration_accounts')
            .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
            .eq('agent_id', agentId)
            .eq('capability', cap);
        } else if (cap === 'storage_dropbox') {
          const { dropboxRefreshToken } = await import('@/lib/dropbox/oauth');
          const refreshed = await dropboxRefreshToken(plainRefresh);
          accessToken = refreshed.access_token;
          await supabase.from('integration_accounts')
            .update({ access_token: refreshed.access_token, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), status: 'active' })
            .eq('agent_id', agentId)
            .eq('capability', cap);
        }
      } catch {
        // Refresh failed — continue with current token or fall through
      }
    }

    const provider = perAgentStorage.provider as string;
    const cap = perAgentStorage.capability as string;

    if (cap === 'storage_google') {
      const { createGoogleConnector } = await import('@/lib/connectors/google');
      const conn = createGoogleConnector(accessToken);
      const synth: IntegrationRow = {
        id:                 `agent:${agentId}:storage_google`,
        agent_id:           agentId,
        provider:           'gmail' as const,
        email:              (perAgentStorage.account_label as string | null) ?? '',
        access_token:       accessToken,
        refresh_token:      (perAgentStorage.refresh_token as string | null) ?? null,
        token_expires_at:   (perAgentStorage.expires_at as string | null) ?? null,
        last_sync_at:       null,
        needs_reauth:       perAgentStorage.status === 'needs_reauth',
        reauth_notified_at: null,
      };
      return { integration: synth, conn };
    }
    if (cap === 'storage_microsoft') {
      const { createMicrosoftConnector } = await import('@/lib/connectors/microsoft');
      const conn = createMicrosoftConnector(accessToken);
      const synth: IntegrationRow = {
        id:                 `agent:${agentId}:storage_microsoft`,
        agent_id:           agentId,
        provider:           'outlook' as const,
        email:              (perAgentStorage.account_label as string | null) ?? '',
        access_token:       accessToken,
        refresh_token:      (perAgentStorage.refresh_token as string | null) ?? null,
        token_expires_at:   (perAgentStorage.expires_at as string | null) ?? null,
        last_sync_at:       null,
        needs_reauth:       perAgentStorage.status === 'needs_reauth',
        reauth_notified_at: null,
      };
      return { integration: synth, conn };
    }
    if (cap === 'storage_dropbox') {
      const { createDropboxConnector } = await import('@/lib/connectors/dropbox');
      const conn = createDropboxConnector(accessToken);
      const synth: IntegrationRow = {
        id:                 `agent:${agentId}:storage_dropbox`,
        agent_id:           agentId,
        provider:           'gmail' as const, // shape compat — solo se lee .conn.files
        email:              '',
        access_token:       accessToken,
        refresh_token:      null,
        token_expires_at:   null,
        last_sync_at:       null,
        needs_reauth:       false,
        reauth_notified_at: null,
      };
      return { integration: synth, conn };
    }
    // Unknown provider — fall through
    console.warn(`[agent-connector] per-agent storage capability '${cap}' con provider '${provider}' sin handler — cayendo a fallback org-level capability='email'`);
  }

  // 2. Fallback org-level — cualquier agente hereda el email conectado por su portal.
  //    WARN: GMAIL_SCOPES ya no incluye drive/calendar (Fase 1, 2026-09-04).
  //    Orgs que reconecten post-Fase-1 fallarán con 403 en files. Migrar a per-agent.
  const portalEmail = (agentSmtpRow as { portal_email?: string | null } | null)?.portal_email;
  if (!portalEmail) return null;

  const { data: orgAcct } = await supabase
    .from('integration_accounts')
    .select('provider, account_label, access_token, refresh_token, expires_at, status, metadata')
    .eq('portal_email', portalEmail)
    .eq('capability', 'email')
    .neq('status', 'disconnected')
    .maybeSingle();

  if (orgAcct) {
    console.warn(`[agent-connector] agentId=${agentId} usando fallback org-level capability='email' (portalEmail=${portalEmail}). Orgs que reconecten correo post-2026-09-04 perderán acceso a Files. Conecta storage per-agent para resolver.`);
  }

  if (orgAcct && orgAcct.provider === 'imap_smtp') {
    // Retrocompat: rows viejas de imap_smtp org-level (creadas por MVP inicial
    // antes del refactor per-agent). Nueva config va en voice_agents.features.
    const { decrypt } = await import('@/lib/crypto');
    const { createImapSmtpConnector } = await import('@/lib/connectors/imap-smtp');
    const meta = (orgAcct.metadata as Record<string, unknown> | null) ?? {};
    const password = decrypt((orgAcct.access_token as string | null) ?? '');
    const conn = createImapSmtpConnector({
      host:     String(meta.host ?? ''),
      port:     Number(meta.port ?? 465),
      secure:   Boolean(meta.secure ?? true),
      username: String(meta.username ?? orgAcct.account_label ?? ''),
      password,
      fromDisplay: (meta.from_display as string | undefined) ?? undefined,
    });
    const synthetic: IntegrationRow = {
      id:                 `org:${portalEmail}:imap_smtp` as string,
      agent_id:           agentId,
      provider:           'outlook' as const,
      email:              (orgAcct.account_label as string | null) ?? '',
      access_token:       '',
      refresh_token:      null,
      token_expires_at:   null,
      last_sync_at:       null,
      needs_reauth:       false,
      reauth_notified_at: null,
    };
    return { integration: synthetic, conn };
  }

  if (!orgAcct) {
    // Fallback secundario: Dropbox como file provider standalone.
    const { data: dbxAcct } = await supabase
      .from('integration_accounts')
      .select('access_token, refresh_token, expires_at, status')
      .eq('portal_email', portalEmail)
      .eq('provider', 'dropbox')
      .eq('capability', 'files')
      .neq('status', 'disconnected')
      .maybeSingle();
    if (!dbxAcct) return null;
    const { getDropboxAccessToken } = await import('@/lib/catalog/lookup');
    const { createDropboxConnector } = await import('@/lib/connectors/dropbox');
    const token = await getDropboxAccessToken(portalEmail, supabase);
    if (!token) return null;
    const conn = createDropboxConnector(token);
    const synthetic: IntegrationRow = {
      id:                 `org:${portalEmail}:dropbox`,
      agent_id:           agentId,
      provider:           'gmail' as const, // shape compat — solo se lee .conn.files
      email:              '',
      access_token:       token,
      refresh_token:      null,
      token_expires_at:   null,
      last_sync_at:       null,
      needs_reauth:       false,
      reauth_notified_at: null,
    };
    return { integration: synthetic, conn };
  }

  // Adapta shape de integration_accounts a IntegrationRow para reusar getConnector.
  // El refresh path escribe a email_integrations por id — este synthetic no tiene
  // id real, así que si el token expira aquí el refresh graba en un lugar que
  // nadie relee. Aceptable temporalmente; TODO migrar refresh a integration_accounts.
  const synthetic: IntegrationRow = {
    id:                 `org:${portalEmail}:${orgAcct.provider}` as string,
    agent_id:           agentId,
    provider:           orgAcct.provider as 'gmail' | 'outlook',
    email:              (orgAcct.account_label as string | null) ?? '',
    access_token:       (orgAcct.access_token as string | null) ?? '',
    refresh_token:      (orgAcct.refresh_token as string | null) ?? null,
    token_expires_at:   (orgAcct.expires_at as string | null) ?? null,
    last_sync_at:       null,
    needs_reauth:       orgAcct.status === 'needs_reauth',
    reauth_notified_at: null,
  };
  const conn = await getConnector(synthetic, supabase);
  return { integration: synthetic, conn };
}
