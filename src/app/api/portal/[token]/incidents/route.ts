import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from('it_incidents')
    .select('*')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ incidents: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as {
    titulo: string; descripcion?: string; mensaje_voz: string; keywords?: string[];
  };
  if (!body.titulo || !body.mensaje_voz)
    return NextResponse.json({ error: 'Título y mensaje de voz requeridos' }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from('it_incidents')
    .insert({
      agent_id:    access.primaryId,
      titulo:      body.titulo,
      descripcion: body.descripcion ?? '',
      mensaje_voz: body.mensaje_voz,
      keywords:    body.keywords ?? [],
      activo:      true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ incident: data }, { status: 201 });
}
