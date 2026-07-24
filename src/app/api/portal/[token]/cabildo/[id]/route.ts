import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string; id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? []).map((a: any) => a.id as string);

  const { data } = await supabase
    .from('cabildo_documents').select('*')
    .in('agent_id', agentIds).eq('id', id).single();

  if (!data) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  return NextResponse.json({ doc: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();
  const body     = await req.json();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? []).map((a: any) => a.id as string);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.titulo    !== undefined) updates.titulo    = body.titulo;
  if (body.contenido !== undefined) updates.contenido = body.contenido;

  const { error } = await supabase
    .from('cabildo_documents').update(updates)
    .in('agent_id', agentIds).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? []).map((a: any) => a.id as string);

  await supabase.from('cabildo_documents').delete().in('agent_id', agentIds).eq('id', id);
  return NextResponse.json({ ok: true });
}
