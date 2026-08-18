import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const allowed = ['titulo', 'descripcion', 'mensaje_voz', 'keywords', 'activo'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (update.activo === false) update.resolved_at = new Date().toISOString();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('it_incidents')
    .update(update)
    .eq('id', id)
    .in('agent_id', access.ids)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ incident: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { error } = await createAdminClient()
    .from('it_incidents').delete().eq('id', id).in('agent_id', access.ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
