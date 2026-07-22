import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { getNextTicketFolio } from '@/lib/helpdesk/folio';

export const dynamic = 'force-dynamic';

interface SurveyActions {
  threshold:         number;
  create_ticket:     boolean;
  notify_manager:    boolean;
  schedule_callback: boolean;
  mark_churn_risk:   boolean;
}

export async function POST(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
  const body    = await req.json() as Record<string, unknown>;

  const call       = (body.toolCallList as Record<string, unknown>[])?.[0];
  const rawArgs    = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args       = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, unknown>;
  const toolCallId = (call?.id as string) ?? 'call_1';

  const { survey_id, respuestas, caller_number, call_id } = args as {
    survey_id:      string;
    respuestas:     Array<{ orden: number; valor: string }>;
    caller_number?: string;
    call_id?:       string;
  };

  const fail = (msg: string) =>
    NextResponse.json({ results: [{ toolCallId, result: msg }] });

  if (!survey_id || !respuestas?.length)
    return fail('Datos de encuesta incompletos.');

  const supabase = createAdminClient();

  const [{ data: questions, error: qErr }, { data: survey }] = await Promise.all([
    supabase.from('survey_questions').select('id, orden, tipo').eq('survey_id', survey_id).order('orden'),
    supabase.from('surveys').select('id, nombre, actions').eq('id', survey_id).single(),
  ]);

  if (qErr || !questions?.length) return fail('Encuesta no encontrada.');

  const ordenMap: Record<number, { id: string; tipo: string }> = {};
  for (const q of questions) ordenMap[q.orden] = { id: q.id, tipo: q.tipo };

  const mapped: Record<string, string> = {};
  for (const r of respuestas) {
    const q = ordenMap[r.orden];
    if (q) mapped[q.id] = String(r.valor);
  }

  if (!Object.keys(mapped).length) return fail('No se mapearon respuestas válidas.');

  const { data: responseRow, error } = await supabase
    .from('survey_responses')
    .insert({
      survey_id,
      agent_id:      agentId,
      caller_number: caller_number ?? null,
      vapi_call_id:  call_id       ?? null,
      respuestas:    mapped,
    })
    .select('id')
    .single();

  if (error) return fail('Error al guardar respuestas.');

  // ── Evaluate automated actions (fire-and-forget) ───────────────────────────
  const actions = survey?.actions as SurveyActions | null;
  const anyEnabled = !!(actions && (
    actions.create_ticket || actions.notify_manager ||
    actions.schedule_callback || actions.mark_churn_risk
  ));

  if (anyEnabled && responseRow) {
    const ratingQ = questions.find(q => q.tipo === 'rating_5' || q.tipo === 'rating_10');
    const siNoQ   = !ratingQ ? questions.find(q => q.tipo === 'si_no') : null;

    let triggered  = false;
    let ratingVal: number | null = null;

    if (ratingQ) {
      ratingVal = Number(mapped[ratingQ.id]);
      triggered = !isNaN(ratingVal) && ratingVal <= (actions!.threshold ?? 2);
    } else if (siNoQ) {
      triggered = ['no'].includes((mapped[siNoQ.id] ?? '').toLowerCase());
    }

    if (triggered) {
      // Load agent info once for all actions
      supabase.from('voice_agents')
        .select('portal_email, business_name, agent_name')
        .eq('id', agentId)
        .single()
        .then(({ data: agent }) => {
          const surveyName = survey!.nombre;
          const callerNum  = caller_number ?? 'desconocido';
          const maxScale   = ratingQ?.tipo === 'rating_10' ? 10 : 5;
          const ratingStr  = ratingVal != null ? `${ratingVal} / ${maxScale}` : 'respuesta negativa';

          const jobs: Promise<unknown>[] = [];

          if (actions!.create_ticket) {
            jobs.push(
              getNextTicketFolio(agentId, supabase).then(folio =>
                Promise.resolve(supabase.from('helpdesk_tickets').insert({
                  agent_id:     agentId,
                  folio,
                  caller_number: callerNum,
                  categoria:    'atencion_cliente',
                  prioridad:    'alta',
                  titulo:       `Calificación baja: ${surveyName}`,
                  descripcion:  `Calificación: ${ratingStr}\nCliente: ${callerNum}`,
                  status:       'abierto',
                }))
              )
            );
          }

          if (actions!.notify_manager && agent?.portal_email) {
            jobs.push(
              sendEmail({
                to:      agent.portal_email,
                subject: `Alerta de calidad: ${surveyName}`,
                html:    `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a2e">
                  <strong>${agent.agent_name ?? agent.business_name}</strong> registró una calificación baja
                  en la encuesta <strong>${surveyName}</strong>.<br><br>
                  Calificación: <strong>${ratingStr}</strong><br>
                  Cliente: ${callerNum}<br><br>
                  Revisa los resultados en el portal de Centinelia.
                </p>`,
              })
            );
          }

          if (actions!.schedule_callback) {
            jobs.push(
              Promise.resolve(supabase.from('agent_tasks').insert({
                portal_email:  agent?.portal_email ?? null,
                created_by:    agentId || null,
                assigned_to:   agentId || null,
                title:         `Callback: calificación baja en "${surveyName}" — ${callerNum}`,
                description:   `Calificación recibida: ${ratingStr}. Llamar al cliente para dar seguimiento y recuperar la experiencia.`,
                status:        'pending',
                trigger_type:  'survey_action',
              }))
            );
          }

          if (actions!.mark_churn_risk) {
            jobs.push(
              Promise.resolve(supabase.from('survey_responses').update({ churn_risk: true }).eq('id', responseRow!.id))
            );
          }

          return Promise.all(jobs);
        })
        .then(undefined, console.error);
    }
  }

  return NextResponse.json({
    results: [{
      toolCallId,
      result: `Encuesta registrada. ${Object.keys(mapped).length} respuestas guardadas. Gracias por su participación.`,
    }],
  });
}
