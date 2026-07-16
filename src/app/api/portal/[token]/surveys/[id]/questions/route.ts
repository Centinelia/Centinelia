import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';

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
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('survey_questions')
    .select('*')
    .eq('survey_id', id)
    .order('orden');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as {
    orden: number; texto: string; tipo: string; opciones?: string[];
  };
  if (!body.texto?.trim()) return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });

  const { data, error } = await supabase
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sp         = req.nextUrl.searchParams;
  const questionId = sp.get('question_id');
  if (!questionId) return NextResponse.json({ error: 'question_id requerido' }, { status: 400 });

  const supabase = createAdminClient();
  if (!await surveyBelongsToAccess(id, access.ids, supabase))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('survey_questions')
    .delete()
    .eq('id', questionId)
    .eq('survey_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
