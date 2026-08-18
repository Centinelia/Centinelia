import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const body = await req.json();

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const allowed = ['title', 'metric', 'target', 'period', 'current', 'active'];
  const update = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(update).length) return NextResponse.json({ ok: true });

  const { data, error } = await createAdminClient()
    .from('agent_goals')
    .update(update)
    .eq('id', id)
    .in('agent_id', access.ids)
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

  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { error } = await createAdminClient()
    .from('agent_goals')
    .delete()
    .eq('id', id)
    .in('agent_id', access.ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
