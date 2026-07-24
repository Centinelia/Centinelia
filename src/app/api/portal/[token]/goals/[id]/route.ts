import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const allowed = ['title', 'metric', 'target', 'period', 'current', 'active'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(update).length) return NextResponse.json({ ok: true });

  const { data, error } = await supabase
    .from('agent_goals')
    .update(update)
    .eq('id', id)
    .eq('agent_id', agent.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { error } = await supabase
    .from('agent_goals')
    .delete()
    .eq('id', id)
    .eq('agent_id', agent.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
