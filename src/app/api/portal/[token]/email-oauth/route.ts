export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

async function auth(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
}

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
  if (!await auth(cookieStore)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent } = await resolvePortal(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Primary: org-level integration_accounts
  if (agent.portal_email) {
    const { data } = await supabase
      .from('integration_accounts')
      .select('id, provider, account_label, status, metadata')
      .eq('portal_email', agent.portal_email)
      .eq('capability', 'email')
      .neq('status', 'disconnected');

    const integrations = (data ?? []).map((row) => {
      const meta = (row.metadata as Record<string, unknown>) ?? {};
      return {
        id:           row.id,
        provider:     row.provider,
        email:        row.account_label,
        auto_reply:   (meta.auto_reply as boolean) ?? false,
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

  return NextResponse.json({ integrations: data ?? [] });
}

// PATCH — toggle auto_reply
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  if (!await auth(cookieStore)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider, auto_reply } = await req.json() as { provider: string; auto_reply: boolean };

  const { supabase, agent } = await resolvePortal(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (agent.portal_email) {
    // Fetch current metadata to merge (preserve last_sync_at etc.)
    const { data: existing } = await supabase
      .from('integration_accounts')
      .select('metadata')
      .eq('portal_email', agent.portal_email)
      .eq('provider', provider)
      .maybeSingle();

    const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};

    await supabase.from('integration_accounts')
      .update({ metadata: { ...existingMeta, auto_reply } })
      .eq('portal_email', agent.portal_email)
      .eq('provider', provider);
  } else {
    // Fallback
    await supabase.from('email_integrations')
      .update({ auto_reply })
      .eq('agent_id', agent.id)
      .eq('provider', provider);
  }

  return NextResponse.json({ ok: true });
}

// DELETE — disconnect an integration
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  if (!await auth(cookieStore)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await req.json() as { provider: string };

  const { supabase, agent } = await resolvePortal(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
