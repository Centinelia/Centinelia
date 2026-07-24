import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string; folio: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, folio } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? []).map((a: any) => a.id as string);

  const { data } = await supabase
    .from('civic_reports').select('*')
    .in('agent_id', agentIds)
    .eq('folio', folio.toUpperCase())
    .single();

  if (!data) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 });
  return NextResponse.json({ report: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, folio } = await params;
  const supabase = createAdminClient();
  const body     = await req.json();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? []).map((a: any) => a.id as string);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status           !== undefined) updates.status           = body.status;
  if (body.notes            !== undefined) updates.notes            = body.notes;
  if (body.description      !== undefined) updates.description      = body.description;
  if (body.tramite_tipo     !== undefined) updates.tramite_tipo     = body.tramite_tipo;
  if (body.docs_received    !== undefined) updates.docs_received    = body.docs_received;
  if (body.area_responsable !== undefined) updates.area_responsable = body.area_responsable;
  if (body.status === 'resuelto' || body.status === 'cerrado') {
    updates.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('civic_reports')
    .update(updates)
    .in('agent_id', agentIds)
    .eq('folio', folio.toUpperCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
