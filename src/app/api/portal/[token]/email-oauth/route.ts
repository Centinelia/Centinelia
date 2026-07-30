export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

// Resolve agent and portal_email from portal token
async function resolvePortal(token: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  return { supabase, agent };
}

// GET — list connected integrations for this portal (reads from integration_accounts)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent } = await resolvePortal(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Primary: org-level integration_accounts
  if (agent.portal_email) {
    const { data } = await supabase
      .from('integration_accounts')
      .select('id, provider, account_label, status, metadata')
      .eq('portal_email', agent.portal_email)
      .eq('capability', 'email')
      .neq('status', 'disconnected');

    // Fetch voice_agents.auto_mode for this agent
    const { data: voiceAgent } = await supabase
      .from('voice_agents')
      .select('id, auto_mode')
      .eq('id', agent.id)
      .single();

    const integrations = (data ?? []).map((row) => {
      const meta = (row.metadata as Record<string, unknown>) ?? {};
      return {
        id:           row.id,
        provider:     row.provider,
        email:        row.account_label,
        auto_reply:   (meta.auto_reply as boolean) ?? false,
        auto_mode:    voiceAgent?.auto_mode ?? null,
        last_sync_at: (meta.last_sync_at as string | null) ?? null,
        needs_reauth: row.status === 'needs_reauth',
      };
    });

    return NextResponse.json({ integrations });
  }

  // Fallback: agent-level email_integrations (for agents without portal_email)
  const { data } = await supabase
    .from('email_integrations')
    .select('id, provider, email, auto_reply, last_sync_at, needs_reauth')
    .eq('agent_id', agent.id);

  // Augment with voice_agents.auto_mode for fallback integrations
  const { data: voiceAgents } = await supabase
    .from('voice_agents')
    .select('id, auto_mode')
    .eq('id', agent.id)
    .single();

  const augmented = (data ?? []).map((row) => ({
    ...row,
    auto_mode: voiceAgents?.auto_mode ?? null,
  }));

  return NextResponse.json({ integrations: augmented });
}

// PATCH — toggle auto_reply and/or auto_mode
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    provider:    string;
    auto_reply?: boolean;
    auto_mode?:  'off' | 'auto' | 'always';
  };
  const { provider, auto_reply, auto_mode } = body;

  if (!provider) {
    return NextResponse.json({ error: 'provider requerido' }, { status: 400 });
  }
  if (auto_mode !== undefined && !['off', 'auto', 'always'].includes(auto_mode)) {
    return NextResponse.json({ error: 'auto_mode inválido' }, { status: 400 });
  }

  const { supabase, agent } = await resolvePortal(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  if (agent.portal_email) {
    // Fetch current metadata to merge (preserve last_sync_at etc.)
    const { data: existing } = await supabase
      .from('integration_accounts')
      .select('metadata')
      .eq('portal_email', agent.portal_email)
      .eq('provider', provider)
      .maybeSingle();

    const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};

    // Build update payloads — auto_mode goes ONLY to voice_agents, auto_reply to integration_accounts + email_integrations
    const integrationAccountsUpdateMeta: Record<string, unknown> = { ...existingMeta };
    if (auto_reply !== undefined) {
      integrationAccountsUpdateMeta.auto_reply = auto_reply;
    }

    const voiceAgentsUpdatePayload: Record<string, unknown> = {};
    if (auto_mode !== undefined) {
      voiceAgentsUpdatePayload.auto_mode = auto_mode;
    }

    const emailIntegrationsUpdatePayload: Record<string, unknown> = {};
    if (auto_reply !== undefined) {
      emailIntegrationsUpdatePayload.auto_reply = auto_reply;
    }

    const promises = [
      supabase.from('integration_accounts')
        .update({ metadata: integrationAccountsUpdateMeta })
        .eq('portal_email', agent.portal_email)
        .eq('provider', provider),
      // email-sync reads auto_reply from email_integrations — keep in sync
      supabase.from('email_integrations')
        .update(emailIntegrationsUpdatePayload)
        .eq('agent_id', agent.id)
        .eq('provider', provider),
    ];

    // Update voice_agents.auto_mode if provided (single source of truth)
    if (auto_mode !== undefined) {
      promises.push(
        supabase.from('voice_agents')
          .update({ auto_mode })
          .eq('id', agent.id)
      );
    }

    await Promise.all(promises);
  } else {
    // Fallback
    const emailIntegrationsUpdatePayload: Record<string, unknown> = {};
    if (auto_reply !== undefined) {
      emailIntegrationsUpdatePayload.auto_reply = auto_reply;
    }

    const promises = [];

    if (Object.keys(emailIntegrationsUpdatePayload).length > 0) {
      promises.push(
        supabase.from('email_integrations')
          .update(emailIntegrationsUpdatePayload)
          .eq('agent_id', agent.id)
          .eq('provider', provider)
      );
    }

    if (auto_mode !== undefined) {
      promises.push(
        supabase.from('voice_agents')
          .update({ auto_mode })
          .eq('id', agent.id)
      );
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE — disconnect an integration
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await req.json() as { provider: string };

  const { supabase, agent } = await resolvePortal(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Remove from both tables
  await Promise.all([
    supabase.from('email_integrations')
      .delete()
      .eq('agent_id', agent.id)
      .eq('provider', provider),

    agent.portal_email
      ? supabase.from('integration_accounts')
          .delete()
          .eq('portal_email', agent.portal_email)
          .eq('provider', provider)
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
