export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse }      from 'next/server';
import { cookies }                        from 'next/headers';
import { createAdminClient }             from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE }  from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

async function resolveAgent(token: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  return { supabase, agent };
}

// GET — list per-agent email connections from email_integrations
export async function GET(_req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent } = await resolveAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data } = await supabase
    .from('email_integrations')
    .select('id, provider, email, last_sync_at, needs_reauth, send_as_email')
    .eq('agent_id', agent.id);

  return NextResponse.json({ connections: data ?? [] });
}

// PATCH — update send_as_email for a given provider connection
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider, send_as_email } = (await req.json()) as { provider: string; send_as_email: string | null };
  const { supabase, agent } = await resolveAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const value = send_as_email?.trim() || null;

  await supabase
    .from('email_integrations')
    .update({ send_as_email: value })
    .eq('agent_id', agent.id)
    .eq('provider', provider);

  return NextResponse.json({ ok: true });
}

// DELETE — disconnect per-agent email
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = (await req.json()) as { provider: string };
  const { supabase, agent } = await resolveAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await supabase
    .from('email_integrations')
    .delete()
    .eq('agent_id', agent.id)
    .eq('provider', provider);

  return NextResponse.json({ ok: true });
}
