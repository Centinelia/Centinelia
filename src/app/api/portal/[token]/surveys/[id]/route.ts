import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

async function authAndAccess(req: NextRequest, token: string) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return { session: null, access: null, error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  const access = await getAgentAccess(token, req);
  if (!access) return { session, access: null, error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return { session, access: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };
  return { session, access, error: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const supabase = createAdminClient();
  const { data, error: dbError } = await supabase
    .from('surveys')
    .select('*, survey_questions(*)')
    .eq('id', id)
    .in('agent_id', access.ids)
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ survey: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const body    = await req.json() as Record<string, unknown>;
  const allowed = ['nombre', 'descripcion', 'objetivo', 'activa', 'auto_apply', 'triggers', 'agent_ids', 'canal', 'actions'];
  const patch   = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const supabase = createAdminClient();
  const { data, error: dbError } = await supabase
    .from('surveys')
    .update(patch)
    .eq('id', id)
    .in('agent_id', access.ids)
    .select()
    .single();

  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ survey: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const supabase = createAdminClient();
  const { error: dbError } = await supabase
    .from('surveys')
    .delete()
    .eq('id', id)
    .in('agent_id', access.ids);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
