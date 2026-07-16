import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Vapi sends the survey responses collected during a call.
// Args: survey_id, respuestas: [{orden: number, valor: string}]
// We map orden → question_id and insert one survey_responses row.

export async function POST(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call    = (body.toolCallList as Record<string, unknown>[])?.[0];
  const rawArgs = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args    = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const { survey_id, respuestas, caller_number, call_id } =
    args as {
      survey_id:     string;
      respuestas:    Array<{ orden: number; valor: string }>;
      caller_number?: string;
      call_id?:       string;
    };

  const fail = (msg: string) =>
    NextResponse.json({ results: [{ toolCallId, result: msg }] });

  if (!survey_id || !respuestas?.length)
    return fail('Datos de encuesta incompletos.');

  const supabase = createAdminClient();

  // Load questions to map orden → id
  const { data: questions, error: qErr } = await supabase
    .from('survey_questions')
    .select('id, orden')
    .eq('survey_id', survey_id)
    .order('orden');

  if (qErr || !questions?.length) return fail('Encuesta no encontrada.');

  const ordenMap: Record<number, string> = {};
  for (const q of questions) ordenMap[q.orden] = q.id;

  const mapped: Record<string, string> = {};
  for (const r of respuestas) {
    const qid = ordenMap[r.orden];
    if (qid) mapped[qid] = String(r.valor);
  }

  if (!Object.keys(mapped).length) return fail('No se mapearon respuestas válidas.');

  const { error } = await supabase
    .from('survey_responses')
    .insert({
      survey_id,
      agent_id:      agentId,
      caller_number: caller_number ?? null,
      vapi_call_id:  call_id       ?? null,
      respuestas:    mapped,
    });

  if (error) return fail('Error al guardar respuestas.');

  return NextResponse.json({
    results: [{
      toolCallId,
      result: `Encuesta registrada. ${Object.keys(mapped).length} respuestas guardadas. Gracias por su participación.`,
    }],
  });
}
