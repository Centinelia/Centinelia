import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();
  const ag = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!ag) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && ag.portal_email && session.portalEmail !== ag.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const allowed = ['titulo', 'descripcion', 'mensaje_voz', 'keywords', 'activo'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  if (update.activo === false) update.resolved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('it_incidents')
    .update(update)
    .eq('id', id)
    .eq('agent_id', ag.id)
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
  const supabase = createAdminClient();
  const ag = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!ag) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && ag.portal_email && session.portalEmail !== ag.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { error } = await supabase
    .from('it_incidents').delete().eq('id', id).eq('agent_id', ag.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
