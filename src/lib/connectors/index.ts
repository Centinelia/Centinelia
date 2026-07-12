import { gmailRefreshToken }   from '@/lib/email/gmail';
import { outlookRefreshToken } from '@/lib/email/outlook';
import { createGoogleConnector }    from './google';
import { createMicrosoftConnector } from './microsoft';
import { decrypt }                  from '@/lib/crypto';
import { sendEmail, reauthRequiredHtml } from '@/lib/email/send';
import type { Connector } from './types';
import type { createAdminClient } from '@/lib/supabase/admin';

export type { Connector, EmailConnector, FilesConnector, ContactsConnector, ContactResult, EmailMessage, FileItem, Attachment, UploadResult, FolderResult, ReplyParams } from './types';

export interface IntegrationRow {
  id:                  string;
  agent_id:            string;
  provider:            'gmail' | 'outlook';
  email:               string;
  access_token:        string;
  refresh_token:       string | null;
  token_expires_at:    string | null;
  last_sync_at:        string | null;
  needs_reauth:        boolean;
  reauth_notified_at:  string | null;
}

type SupabaseClient = ReturnType<typeof createAdminClient>;

export async function getConnector(integration: IntegrationRow, supabase: SupabaseClient): Promise<Connector> {
  const accessToken = await refreshIfNeeded(integration, supabase);
  return integration.provider === 'gmail'
    ? createGoogleConnector(accessToken)
    : createMicrosoftConnector(accessToken);
}

export async function refreshIfNeeded(integration: IntegrationRow, supabase: SupabaseClient): Promise<string> {
  const expiresAt    = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) return integration.access_token;
  if (!integration.refresh_token) return integration.access_token;
  try {
    const plainRefreshToken = decrypt(integration.refresh_token);
    const refreshed = integration.provider === 'gmail'
      ? await gmailRefreshToken(plainRefreshToken)
      : await outlookRefreshToken(plainRefreshToken);
    await supabase.from('email_integrations').update({
      access_token:     refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      needs_reauth:     false,
    }).eq('id', integration.id);
    return refreshed.access_token;
  } catch {
    await supabase.from('email_integrations')
      .update({ needs_reauth: true })
      .eq('id', integration.id);

    const { data: agent } = await supabase
      .from('voice_agents')
      .select('portal_email, business_name, portal_token')
      .eq('id', integration.agent_id)
      .single();

    // Sync reauth status to integration_accounts so portal UI reflects the broken token
    if (agent?.portal_email) {
      await supabase.from('integration_accounts')
        .update({ status: 'needs_reauth' })
        .eq('portal_email', agent.portal_email)
        .eq('provider', integration.provider);
    }

    if (!integration.reauth_notified_at && agent?.portal_email) {
      const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
      const portalUrl = `${appUrl}/portal/${agent.portal_token}`;
      const providerLabel = integration.provider === 'gmail' ? 'Gmail' : 'Outlook';
      await sendEmail({
        to:      agent.portal_email,
        subject: `Tu ${providerLabel} necesita reconexion — Centinelia`,
        html:    reauthRequiredHtml({
          businessName: agent.business_name ?? '',
          provider:     integration.provider,
          email:        integration.email,
          lastSyncAt:   integration.last_sync_at ?? null,
          portalUrl,
        }),
      });
      await supabase.from('email_integrations')
        .update({ reauth_notified_at: new Date().toISOString() })
        .eq('id', integration.id);
    }

    return integration.access_token;
  }
}
