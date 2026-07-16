import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';

type Question = {
  id: string;
  orden: number;
  texto: string;
  tipo: string;
  opciones: string[] | null;
};

type Response = {
  id: string;
  caller_number: string | null;
  vapi_call_id: string | null;
  created_at: string;
  respuestas: Record<string, string>;
};

function aggregateResults(questions: Question[], responses: Response[]) {
  return questions.map(q => {
    const values = responses
      .map(r => r.respuestas[q.id])
      .filter((v): v is string => v !== undefined && v !== null && v !== '');

    if (q.tipo === 'rating_5' || q.tipo === 'rating_10') {
      const nums   = values.map(Number).filter(n => !isNaN(n));
      const max    = q.tipo === 'rating_5' ? 5 : 10;
      const avg    = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null;
      const dist: Record<string, number> = {};
      for (let i = 1; i <= max; i++) dist[String(i)] = 0;
      for (const n of nums) dist[String(n)] = (dist[String(n)] ?? 0) + 1;
      return { question_id: q.id, tipo: q.tipo, count: nums.length, avg, distribution: dist };
    }

    if (q.tipo === 'si_no') {
      const si  = values.filter(v => v.toLowerCase() === 'si' || v.toLowerCase() === 'sí').length;
      const no  = values.filter(v => v.toLowerCase() === 'no').length;
      const pct = values.length ? Math.round((si / values.length) * 100) : null;
      return { question_id: q.id, tipo: q.tipo, count: values.length, si, no, pct_si: pct };
    }

    if (q.tipo === 'multiple') {
      const dist: Record<string, number> = {};
      for (const opt of (q.opciones ?? [])) dist[opt] = 0;
      for (const v of values) dist[v] = (dist[v] ?? 0) + 1;
      return { question_id: q.id, tipo: q.tipo, count: values.length, distribution: dist };
    }

    // texto — return last N verbatims
    return { question_id: q.id, tipo: q.tipo, count: values.length, texts: values.slice(-50) };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const access        = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = createAdminClient();

  const { data: survey } = await supabase
    .from('surveys')
    .select('id, nombre')
    .eq('id', id)
    .in('agent_id', access.ids)
    .single();

  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ data: questions }, { data: responses }] = await Promise.all([
    supabase
      .from('survey_questions')
      .select('*')
      .eq('survey_id', id)
      .order('orden'),
    supabase
      .from('survey_responses')
      .select('id, caller_number, vapi_call_id, created_at, respuestas')
      .eq('survey_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const aggregates = aggregateResults(questions ?? [], responses ?? []);

  return NextResponse.json({
    survey_id:   id,
    nombre:      survey.nombre,
    total:       (responses ?? []).length,
    questions:   questions ?? [],
    aggregates,
    responses:   responses ?? [],
  });
}
