import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getOrgAgentIds } from '@/lib/portal/roster';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import type { VoiceAgent } from '@/types/agent';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const body = await req.json();
  const supabase = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const allowed = ['status', 'nombre', 'telefono', 'servicio', 'fecha', 'hora'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  // Org-scoped. Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const roster = await getOrgAgentIds(supabase, agent.portal_email, agent.id);
  const { data, error } = await supabase
    .from('appointments_voice').update(update).eq('id', id).in('agent_id', roster).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire outbound survey call when appointment is marked completada.
  // Usar el agent_id REAL del appointment (puede ser un peer, no el primary).
  if (update.status === 'completada' && data?.telefono) {
    const appointmentAgentId = (data as { agent_id?: string }).agent_id ?? agent.id;
    schedulePostAppointmentSurvey(appointmentAgentId, data as {
      telefono: string; nombre?: string | null; servicio?: string | null;
    }).catch(console.error);
  }

  return NextResponse.json(data);
}

// ── Post-appointment survey trigger (fire-and-forget) ─────────────────────────

type SurveyQ = {
  id:         string;
  orden:      number;
  texto:      string;
  tipo:       string;
  opciones:   string[] | null;
  conditions: { if_rating_lte?: number; if_answer?: string; then_say?: string } | null;
};

async function schedulePostAppointmentSurvey(
  agentId:     string,
  appointment: { telefono: string; nombre?: string | null; servicio?: string | null },
) {
  const supabase = createAdminClient();

  const [agentRes, surveyRes] = await Promise.all([
    supabase.from('voice_agents').select('*').eq('id', agentId).single(),
    supabase
      .from('surveys')
      .select('id, nombre, survey_questions(id, orden, texto, tipo, opciones, conditions)')
      .eq('agent_id', agentId)
      .eq('activa', true)
      .eq('auto_apply', true)
      .contains('triggers', ['after_appointment'])
      .limit(1)
      .maybeSingle(),
  ]);

  const fullAgent = agentRes.data as VoiceAgent | null;
  const survey    = surveyRes.data;
  if (!fullAgent || !survey) return;

  const questions = (survey.survey_questions as SurveyQ[] | null) ?? [];
  if (!questions.length) return;

  const qLines = questions.map(q => {
    let hint = '';
    if (q.tipo === 'rating_5')  hint = ' [escala 1–5]';
    if (q.tipo === 'rating_10') hint = ' [escala 1–10]';
    if (q.tipo === 'si_no')     hint = ' [sí / no]';
    if (q.tipo === 'multiple' && q.opciones?.length) hint = ` [opciones: ${q.opciones.join(', ')}]`;
    const cond = q.conditions;
    let condLine = '';
    if (cond?.then_say?.trim()) {
      if (cond.if_rating_lte != null)
        condLine = `\n     → Si responde ${cond.if_rating_lte} o menos, di exactamente: "${cond.then_say.trim()}"`;
      else if (cond.if_answer)
        condLine = `\n     → Si responde "${cond.if_answer}", di exactamente: "${cond.then_say.trim()}"`;
    }
    return `  ${q.orden}. ${q.texto}${hint}${condLine}`;
  });

  const servicioLabel = appointment.servicio ? ` de ${appointment.servicio}` : '';
  const nPreguntas    = questions.length;

  const campaignInstructions = [
    `ENCUESTA POST-CITA — "${survey.nombre}"`,
    `ID de encuesta: ${survey.id}`,
    `Motivo de la llamada: verificar la experiencia del cliente tras su cita${servicioLabel}.`,
    '',
    'Preguntas:',
    ...qLines,
    '',
    'INSTRUCCIONES DE ENCUESTA:',
    '- El propósito de esta llamada ES la encuesta. Una vez que el cliente confirme que tiene un momento, procede directamente con las preguntas.',
    '- Haz UNA pregunta a la vez y espera la respuesta. No las enumeres todas de golpe.',
    '- Sé breve, natural y amable.',
    '- Si el cliente no quiere participar, agradece y cierra sin insistir.',
    `- En cuanto termines (o si el cliente se niega), llama a registrar_encuesta con survey_id="${survey.id}" y las respuestas recopiladas. Con al menos una respuesta ya vale registrar.`,
  ].join('\n');

  const motivo = `queremos saber cómo estuvo${servicioLabel}. ¿Tiene un momento para ${nPreguntas} pregunta${nPreguntas !== 1 ? 's' : ''} rápida${nPreguntas !== 1 ? 's' : ''}?`;

  await triggerOutboundCall({
    agent:          fullAgent,
    customerNumber: appointment.telefono,
    customerName:   appointment.nombre ?? undefined,
    motivo,
    campaignInstructions,
  });
}
