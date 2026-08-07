import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const allowed = ['status', 'prioridad', 'asignado_a', 'asignado_tel', 'resolucion', 'descripcion'];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  update.updated_at = new Date().toISOString();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('helpdesk_tickets')
    .update(update)
    .eq('id', id)
    .in('agent_id', access.ids)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Al resolver/cerrar un ticket con anuncio linkeado, apagamos el aviso
  // global. Cuando se reabre, lo re-activamos (para que Nia vuelva a
  // anunciarlo si el problema volvió).
  try {
    if (data?.incident_id && (update.status === 'resuelto' || update.status === 'cerrado')) {
      await supabase.from('it_incidents').update({ activo: false }).eq('id', data.incident_id as string);
    } else if (data?.incident_id && update.status === 'abierto') {
      await supabase.from('it_incidents').update({ activo: true }).eq('id', data.incident_id as string);
    }
  } catch {
    // silent — el ticket ya se guardó, el aviso se puede sincronizar a mano
  }

  if (update.status === 'resuelto' && data?.caller_number && data?.agent_id) {
    schedulePostTicketSurvey(
      data.agent_id as string,
      { caller_number: data.caller_number as string, titulo: data.titulo as string | null, folio: data.folio as string | null },
    ).catch(console.error);
  }

  return NextResponse.json({ ticket: data });
}

async function schedulePostTicketSurvey(
  agentId:  string,
  ticket:   { caller_number: string; titulo?: string | null; folio?: string | null },
) {
  const supabase = createAdminClient();

  const [agentRes, surveyRes] = await Promise.all([
    supabase.from('voice_agents').select('portal_email').eq('id', agentId).single(),
    supabase
      .from('surveys')
      .select('id, nombre')
      .eq('agent_id', agentId)
      .eq('activa', true)
      .eq('auto_apply', true)
      .contains('triggers', ['after_ticket'])
      .limit(1)
      .maybeSingle(),
  ]);

  const survey = surveyRes.data;
  if (!survey) return;

  const folioLabel = ticket.folio ? ` #${ticket.folio}` : '';
  await supabase.from('agent_tasks').insert({
    portal_email: agentRes.data?.portal_email ?? null,
    created_by:   agentId,
    assigned_to:  agentId,
    title:        `Encuesta post-ticket${folioLabel}: llamar a ${ticket.caller_number}`,
    description:  `Ticket resuelto${folioLabel}${ticket.titulo ? `: "${ticket.titulo}"` : ''}. Llama al cliente y aplica la encuesta "${survey.nombre}" (survey_id: ${survey.id}).`,
    status:       'pending',
    trigger_type: 'survey_action',
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { error } = await createAdminClient()
    .from('helpdesk_tickets')
    .delete()
    .eq('id', id)
    .in('agent_id', access.ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
