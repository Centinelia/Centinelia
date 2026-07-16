import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
