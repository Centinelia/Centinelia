import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { getConnector, type IntegrationRow } from '@/lib/connectors';

type EmailIntegration = IntegrationRow & {
  agent_id:     string;
  email:        string;
  auto_reply:   boolean;
  last_sync_at: string | null;
};

export async function syncAllEmailIntegrations(): Promise<{ synced: number; errors: number }> {
  const supabase = createAdminClient();

  const { data: integrations } = await supabase
    .from('email_integrations')
    .select('*')
    .order('last_sync_at', { ascending: true, nullsFirst: true });

  if (!integrations?.length) return { synced: 0, errors: 0 };

  let synced = 0; let errors = 0;

  for (const integration of integrations as EmailIntegration[]) {
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

async function syncIntegration(integration: EmailIntegration, supabase: ReturnType<typeof createAdminClient>) {
  const conn = await getConnector(integration, supabase);

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, client_email, portal_token, role_knowledge_base, role, portal_email, approval_email')
    .eq('id', integration.agent_id)
    .single();

  const { data: orgData } = agent?.portal_email
    ? await supabase.from('organizations').select('knowledge_base').eq('portal_email', agent.portal_email).single()
    : { data: null };
  const knowledge_base = orgData?.knowledge_base ?? null;

  if (!agent?.client_email) return;

  const since = integration.last_sync_at
    ? new Date(integration.last_sync_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const messages = await conn.email.fetchUnread(since);

  const syncedAt = new Date().toISOString();
  await supabase.from('email_integrations')
    .update({ last_sync_at: syncedAt })
    .eq('id', integration.id);

  // Sync last_sync_at to integration_accounts so the portal UI shows fresh data
  if (agent.portal_email) {
    const { data: ia } = await supabase
      .from('integration_accounts')
      .select('metadata')
      .eq('portal_email', agent.portal_email)
      .eq('provider', integration.provider)
      .maybeSingle();
    const meta = (ia?.metadata as Record<string, unknown>) ?? {};
    await supabase.from('integration_accounts')
      .update({ metadata: { ...meta, last_sync_at: syncedAt } })
      .eq('portal_email', agent.portal_email)
      .eq('provider', integration.provider);
  }

  for (const msg of messages) {
    // Guard against re-processing emails whose markRead silently failed on a prior sync
    const { data: existing } = await supabase
      .from('ops_inbox')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('raw_message_id', msg.id)
      .maybeSingle();

    if (existing) {
      await conn.email.markRead(msg.id).catch((err) =>
        console.error(`[email-sync] markRead retry failed for ${msg.id}:`, err)
      );
      continue;
    }

    // Detect thread reply: check if this is a response to an info_requested email
    let existingInboxId: string | undefined;
    let originalEmailBody: string | undefined;
    if (msg.threadId) {
      const { data: infoThread } = await supabase
        .from('ops_inbox')
        .select('id, email_body')
        .eq('agent_id', agent.id)
        .eq('thread_id', msg.threadId)
        .eq('status', 'info_requested')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (infoThread) {
        existingInboxId   = infoThread.id as string;
        originalEmailBody = infoThread.email_body as string;
      }
    }

    await conn.email.markRead(msg.id).catch((err) =>
      console.error(`[email-sync] markRead failed for ${msg.id}:`, err)
    );

    await processInboxEmail({
      agentId:           agent.id,
      source:            integration.provider,
      rawMessageId:      msg.id,
      threadId:          msg.threadId,
      emailFrom:         msg.from,
      emailSubject:      msg.subject,
      emailBody:         msg.body,
      attachments:       [],
      agentName:         (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:      agent.business_name as string,
      knowledgeBase:     knowledge_base,
      roleKB:            agent.role_knowledge_base as string | null,
      agentRole:         agent.role as string | null,
      ownerEmail:        agent.client_email as string,
      portalToken:       agent.portal_token as string,
      portalEmail:       agent.portal_email as string | undefined,
      autoReply:         integration.auto_reply,
      approvalEmail:     (agent as Record<string, unknown>).approval_email as string | null | undefined,
      existingInboxId,
      originalEmailBody,
      sendReplyFn:       (body: string) => conn.email.sendReply({
        messageId: msg.id,
        threadId:  msg.threadId,
        to:        msg.from,
        subject:   msg.subject,
        body,
      }),
    });
  }
}
