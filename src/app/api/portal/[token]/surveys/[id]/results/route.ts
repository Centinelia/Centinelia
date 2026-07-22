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

type SurveyResponse = {
  id: string;
  caller_number: string | null;
  vapi_call_id: string | null;
  created_at: string;
  respuestas: Record<string, string>;
};

function aggregateResults(questions: Question[], responses: SurveyResponse[]) {
  return questions.map(q => {
    const values = responses
      .map(r => r.respuestas[q.id])
      .filter((v): v is string => v !== undefined && v !== null && v !== '');

    if (q.tipo === 'rating_5' || q.tipo === 'rating_10') {
      const nums = values.map(Number).filter(n => !isNaN(n));
      const max  = q.tipo === 'rating_5' ? 5 : 10;
      const avg  = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const dist: Record<string, number> = {};
      for (let i = 1; i <= max; i++) dist[String(i)] = 0;
      for (const n of nums) dist[String(n)] = (dist[String(n)] ?? 0) + 1;
      return { question_id: q.id, tipo: q.tipo, count: nums.length, avg, distribution: dist };
    }

    if (q.tipo === 'si_no') {
      const si  = values.filter(v => ['si', 'sí'].includes(v.toLowerCase())).length;
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

    return { question_id: q.id, tipo: q.tipo, count: values.length, texts: values.slice(-50) };
  });
}

function ratingAvg(q: Question, responses: SurveyResponse[]): { avg: number | null; count: number } {
  const nums = responses
    .map(r => r.respuestas[q.id])
    .filter((v): v is string => !!v)
    .map(Number)
    .filter(n => !isNaN(n));
  return { avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null, count: nums.length };
}

function siNoPct(q: Question, responses: SurveyResponse[]): { pct: number | null; count: number } {
  const vals = responses
    .map(r => r.respuestas[q.id])
    .filter((v): v is string => !!v);
  if (!vals.length) return { pct: null, count: 0 };
  const si = vals.filter(v => ['si', 'sí'].includes(v.toLowerCase())).length;
  return { pct: Math.round((si / vals.length) * 100), count: vals.length };
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

  const now = new Date();
  const d30 = new Date(now.getTime() - 30  * 86_400_000).toISOString();
  const d60 = new Date(now.getTime() - 60  * 86_400_000).toISOString();

  const [{ data: questions }, { data: responses }] = await Promise.all([
    supabase.from('survey_questions').select('*').eq('survey_id', id).order('orden'),
    supabase.from('survey_responses')
      .select('id, caller_number, vapi_call_id, created_at, respuestas')
      .eq('survey_id', id)
      .order('created_at', { ascending: false }),
  ]);

  const qs   = questions ?? [];
  const all  = responses ?? [];
  const curr = all.filter(r => r.created_at >= d30);
  const prev = all.filter(r => r.created_at >= d60 && r.created_at < d30);

  const aggregates = aggregateResults(qs, all);

  // Trends per question (rating + si_no only)
  const trends: Record<string, {
    current_avg: number | null; prev_avg: number | null; delta: number | null;
    current_count: number; prev_count: number;
  }> = {};

  for (const q of qs) {
    if (q.tipo === 'rating_5' || q.tipo === 'rating_10') {
      const c = ratingAvg(q, curr);
      const p = ratingAvg(q, prev);
      const delta = c.avg != null && p.avg != null
        ? Math.round((c.avg - p.avg) * 10) / 10
        : null;
      trends[q.id] = {
        current_avg:   c.avg != null ? Math.round(c.avg * 10) / 10 : null,
        prev_avg:      p.avg != null ? Math.round(p.avg * 10) / 10 : null,
        delta,
        current_count: c.count,
        prev_count:    p.count,
      };
    } else if (q.tipo === 'si_no') {
      const c = siNoPct(q, curr);
      const p = siNoPct(q, prev);
      const delta = c.pct != null && p.pct != null ? c.pct - p.pct : null;
      trends[q.id] = {
        current_avg:   c.pct,
        prev_avg:      p.pct,
        delta,
        current_count: c.count,
        prev_count:    p.count,
      };
    }
  }

  return NextResponse.json({
    survey_id:  id,
    nombre:     survey.nombre,
    total:      all.length,
    questions:  qs,
    aggregates,
    trends,
    responses:  all,
  });
}
