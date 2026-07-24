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

async function surveyBelongsToAccess(surveyId: string, accessIds: string[], supabase: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>) {
  const { data } = await supabase
    .from('surveys')
    .select('id')
    .eq('id', surveyId)
    .in('agent_id', accessIds)
    .single();
  return !!data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: dbError } = await supabase
    .from('survey_questions')
    .select('*')
    .eq('survey_id', id)
    .order('orden');

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as {
    orden: number; texto: string; tipo: string; opciones?: string[];
  };
  if (!body.texto?.trim()) return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from('survey_questions')
    .insert({
      survey_id: id,
      orden:     body.orden,
      texto:     body.texto.trim(),
      tipo:      body.tipo ?? 'rating_5',
      opciones:  body.opciones ?? null,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ question: data }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const sp         = req.nextUrl.searchParams;
  const questionId = sp.get('question_id');
  if (!questionId) return NextResponse.json({ error: 'question_id requerido' }, { status: 400 });

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as { conditions?: Record<string, unknown> | null };

  const { data, error: dbError } = await supabase
    .from('survey_questions')
    .update({ conditions: body.conditions ?? null })
    .eq('id', questionId)
    .eq('survey_id', id)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ question: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const { access, error } = await authAndAccess(req, token);
  if (error) return error;

  const sp         = req.nextUrl.searchParams;
  const questionId = sp.get('question_id');
  if (!questionId) return NextResponse.json({ error: 'question_id requerido' }, { status: 400 });

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: dbError } = await supabase
    .from('survey_questions')
    .delete()
    .eq('id', questionId)
    .eq('survey_id', id);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
