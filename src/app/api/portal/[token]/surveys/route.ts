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

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('surveys')
    .select('*, survey_questions(*)')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ surveys: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as {
    nombre:      string;
    descripcion?: string;
    objetivo?:   string;
    activa?:     boolean;
    auto_apply?: boolean;
    triggers?:   string[];
    agent_ids?:  string[];
    canal?:      string;
    questions?:  Array<{ orden: number; texto: string; tipo: string; opciones?: string[] }>;
  };
  if (!body.nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: survey, error } = await supabase
    .from('surveys')
    .insert({
      agent_id:   access.primaryId,
      nombre:     body.nombre.trim(),
      descripcion: body.descripcion ?? null,
      objetivo:   body.objetivo   ?? null,
      activa:     body.activa     ?? true,
      auto_apply: body.auto_apply ?? true,
      triggers:   body.triggers   ?? [],
      agent_ids:  body.agent_ids  ?? [],
      canal:      body.canal      ?? 'llamada',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let insertedQuestions: unknown[] = [];
  if (body.questions?.length) {
    const rows = body.questions.map(q => ({
      survey_id: survey.id,
      orden:     q.orden,
      texto:     q.texto,
      tipo:      q.tipo,
      opciones:  q.opciones ?? null,
    }));
    const { data: qs } = await supabase.from('survey_questions').insert(rows).select();
    insertedQuestions = qs ?? [];
  }

  return NextResponse.json({ survey: { ...survey, survey_questions: insertedQuestions } }, { status: 201 });
}
