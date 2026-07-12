export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

async function auth(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
}

// GET — list connected integrations for this portal
export async function GET(_req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  if (!await auth(cookieStore)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('id').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data } = await supabase
    .from('email_integrations')
    .select('id, provider, email, auto_reply, last_sync_at')
    .eq('agent_id', agent.id);

  return NextResponse.json({ integrations: data ?? [] });
}

// PATCH — toggle auto_reply
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  if (!await auth(cookieStore)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider, auto_reply } = await req.json() as { provider: string; auto_reply: boolean };

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('id').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.from('email_integrations')
    .update({ auto_reply })
    .eq('agent_id', agent.id)
    .eq('provider', provider);

  return NextResponse.json({ ok: true });
}

// DELETE — disconnect an integration
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token }   = await params;
  const cookieStore = await cookies();
  if (!await auth(cookieStore)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { provider } = await req.json() as { provider: string };

  const supabase = createAdminClient();
  const { data: agent } = await supabase.from('voice_agents').select('id').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase.from('email_integrations')
    .delete()
    .eq('agent_id', agent.id)
    .eq('provider', provider);

  return NextResponse.json({ ok: true });
}
