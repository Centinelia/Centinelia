import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import {
  gmailRefreshToken, gmailFetchUnread, gmailMarkRead, gmailSendReply,
} from '@/lib/email/gmail';
import {
  outlookRefreshToken, outlookFetchUnread, outlookMarkRead, outlookSendReply,
} from '@/lib/email/outlook';

interface Integration {
  id:              string;
  agent_id:        string;
  provider:        'gmail' | 'outlook';
  email:           string;
  access_token:    string;
  refresh_token:   string | null;
  token_expires_at: string | null;
  auto_reply:      boolean;
  last_sync_at:    string | null;
}

export async function syncAllEmailIntegrations(): Promise<{ synced: number; errors: number }> {
  const supabase = createAdminClient();

  const { data: integrations } = await supabase
    .from('email_integrations')
    .select('*')
    .order('last_sync_at', { ascending: true, nullsFirst: true });

  if (!integrations?.length) return { synced: 0, errors: 0 };

  let synced = 0; let errors = 0;

  for (const integration of integrations as Integration[]) {
    try {
      await syncIntegration(integration, supabase);
      synced++;
    } catch (err) {
      console.error(`[email-sync] error for ${integration.id}:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

async function syncIntegration(integration: Integration, supabase: ReturnType<typeof createAdminClient>) {
  // Refresh token if within 5 minutes of expiry or already expired
  let accessToken = integration.access_token;
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (needsRefresh && integration.refresh_token) {
    const refreshed = integration.provider === 'gmail'
      ? await gmailRefreshToken(integration.refresh_token)
      : await outlookRefreshToken(integration.refresh_token);

    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    await supabase.from('email_integrations').update({
      access_token:    accessToken,
      token_expires_at: newExpiry,
    }).eq('id', integration.id);
  }

  // Fetch agent info
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, client_email, portal_token, knowledge_base, role_knowledge_base, role')
    .eq('id', integration.agent_id)
    .single();

  if (!agent?.client_email) return;

  const since = integration.last_sync_at
    ? new Date(integration.last_sync_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000); // first sync: last 24h

  const messages = integration.provider === 'gmail'
    ? await gmailFetchUnread(accessToken, since)
    : await outlookFetchUnread(accessToken, since);

  // Update last_sync_at before processing so concurrent runs don't duplicate
  await supabase.from('email_integrations')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', integration.id);

  for (const msg of messages) {
    const { data: inboxItem } = await supabase
      .from('ops_inbox')
      .insert({
        agent_id:       agent.id,
        source:         integration.provider,
        raw_message_id: msg.id,
        email_from:     msg.from,
        email_subject:  msg.subject,
        email_body:     msg.body.slice(0, 8000),
        attachments:    [],
        status:         'pending',
      })
      .select('id, ai_draft, approval_token')
      .single();

    // Mark as read in the provider so we don't pick it up again
    if (integration.provider === 'gmail') {
      await gmailMarkRead(accessToken, msg.id).catch(() => {});
    } else {
      await outlookMarkRead(accessToken, msg.id).catch(() => {});
    }

    // Full AI processing (generates summary, draft, sends approval email)
    await processInboxEmail({
      agentId:       agent.id,
      source:        integration.provider,
      rawMessageId:  msg.id,
      emailFrom:     msg.from,
      emailSubject:  msg.subject,
      emailBody:     msg.body,
      attachments:   [],
      agentName:     (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:  agent.business_name as string,
      knowledgeBase: agent.knowledge_base as string | null,
      roleKB:        agent.role_knowledge_base as string | null,
      agentRole:     agent.role as string | null,
      ownerEmail:    agent.client_email as string,
      portalToken:   agent.portal_token as string,
    });

    // Auto-reply: if enabled, send AI draft immediately without waiting for approval
    if (integration.auto_reply && inboxItem?.ai_draft) {
      try {
        if (integration.provider === 'gmail') {
          const gmailMsg = msg as import('@/lib/email/gmail').GmailMessage;
          await gmailSendReply(accessToken, gmailMsg.threadId, msg.from, msg.subject, inboxItem.ai_draft);
        } else {
          await outlookSendReply(accessToken, msg.id, inboxItem.ai_draft);
        }
        await supabase.from('ops_inbox').update({ status: 'auto_replied' }).eq('id', inboxItem.id);
      } catch (err) {
        console.error('[email-sync] auto-reply failed:', err);
      }
    }
  }
}
