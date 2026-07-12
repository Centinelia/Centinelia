import { gmailRefreshToken }   from '@/lib/email/gmail';
import { outlookRefreshToken } from '@/lib/email/outlook';
import { createGoogleConnector }    from './google';
import { createMicrosoftConnector } from './microsoft';
import type { Connector } from './types';
import type { createAdminClient } from '@/lib/supabase/admin';

export type { Connector, EmailConnector, FilesConnector, EmailMessage, FileItem, Attachment, UploadResult, FolderResult, ReplyParams } from './types';

export interface IntegrationRow {
  id:               string;
  provider:         'gmail' | 'outlook';
  access_token:     string;
  refresh_token:    string | null;
  token_expires_at: string | null;
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
    const refreshed = integration.provider === 'gmail'
      ? await gmailRefreshToken(integration.refresh_token)
      : await outlookRefreshToken(integration.refresh_token);
    await supabase.from('email_integrations').update({
      access_token:     refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('id', integration.id);
    return refreshed.access_token;
  } catch {
    return integration.access_token;
  }
}
