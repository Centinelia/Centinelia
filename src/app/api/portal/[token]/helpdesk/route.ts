import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { getNextTicketFolio } from '@/lib/helpdesk/folio';
import { sendEmail } from '@/lib/email/send';
import { ticketEmailHtml } from '@/lib/ops/approval-email';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies } from 'next/headers';
import { classifyTicket } from '@/lib/helpdesk/classify';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const sp         = req.nextUrl.searchParams;
  const status     = sp.get('status');
  const categoria  = sp.get('categoria');
  const asignadoA  = sp.get('asignado_a');

  const supabase = createAdminClient();
  let q = supabase
    .from('helpdesk_tickets')
    .select('*')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status)    q = q.eq('status', status);
  if (categoria) q = q.eq('categoria', categoria);
  if (asignadoA) q = q.eq('asignado_a', asignadoA);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && access.portalEmail && session.portalEmail !== access.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();
  const body = await req.json() as {
    titulo: string; categoria?: string; prioridad?: string;
    descripcion?: string; asignado_a?: string; asignado_tel?: string; caller_number?: string;
    /** Si true, crea un it_incidents linkeado y lo anuncia en llamadas. */
    anunciar_en_llamadas?: boolean;
    /** Mensaje que dice el empleado al inicio de la llamada. Requerido si anunciar_en_llamadas=true. */
    mensaje_voz?: string;
    /** Keywords para detectar cuando el caller pregunta por el tema. Opcional. */
    incident_keywords?: string[];
  };
  if (!body.titulo) return NextResponse.json({ error: 'Título requerido' }, { status: 400 });

  // Auto-clasificar si el caller no mandó categoria/prioridad.
  // Aplica [[feedback-empleados-inteligentes]]: Neo infiere en vez de pedir
  // al usuario que llene dropdowns. Voz/API que ya los manda toman precedencia.
  let classifiedCategoria = body.categoria;
  let classifiedPrioridad = body.prioridad;
  if (!classifiedCategoria || !classifiedPrioridad) {
    const inferred = await classifyTicket({ titulo: body.titulo, descripcion: body.descripcion ?? null });
    classifiedCategoria = classifiedCategoria ?? inferred.categoria;
    classifiedPrioridad = classifiedPrioridad ?? inferred.prioridad;
  }

  // Nuevos tickets se crean bajo el agente primario del portal
  const folio = await getNextTicketFolio(access.primaryId, supabase);
  // Captura quién registra: sub-user usa su portal_email; owner usa "owner"
  // (para distinguir de sub-users sin exponer el email personal).
  const createdBy = session.isSubUser
    ? (session.portalEmail ?? 'sub_user')
    : 'owner';

  // Si el usuario pidió anunciar en llamadas, crea el it_incident PRIMERO
  // y linkea el ticket. Al resolver el ticket auto-cerramos el incident (ver PATCH).
  let incidentId: string | null = null;
  if (body.anunciar_en_llamadas && body.mensaje_voz?.trim()) {
    const { data: incRow, error: incErr } = await supabase
      .from('it_incidents')
      .insert({
        agent_id:    access.primaryId,
        titulo:      body.titulo,
        descripcion: body.descripcion ?? '',
        mensaje_voz: body.mensaje_voz.trim(),
        keywords:    body.incident_keywords ?? [],
        activo:      true,
      })
      .select('id')
      .single();
    if (incErr) return NextResponse.json({ error: `Incident: ${incErr.message}` }, { status: 500 });
    incidentId = (incRow as { id: string }).id;
  }

  const { data, error } = await supabase
    .from('helpdesk_tickets')
    .insert({
      agent_id:      access.primaryId,
      folio,
      titulo:        body.titulo,
      categoria:     classifiedCategoria ?? 'otro',
      prioridad:     classifiedPrioridad ?? 'normal',
      descripcion:   body.descripcion  ?? null,
      asignado_a:    body.asignado_a   ?? null,
      asignado_tel:  body.asignado_tel ?? null,
      caller_number: body.caller_number ?? null,
      created_by:    createdBy,
      incident_id:   incidentId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email notification to owner
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('client_email, portal_token')
    .eq('id', access.primaryId)
    .single();

  const ownerEmail = agent?.client_email as string | null;
  const pToken     = agent?.portal_token  as string | null;
  if (ownerEmail && pToken) {
    const cookieStore = await cookies();
    const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
    const submittedBy = session?.isSubUser ? (session.portalEmail ?? null) : null;
    const portalUrl   = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/portal/${pToken}/oficina/helpdesk`;

    sendEmail({
      to:      ownerEmail,
      subject: `[Ticket ${data!.folio}] ${data!.titulo} — ${(data!.prioridad as string).toUpperCase()}`,
      html:    ticketEmailHtml({
        folio:       data!.folio       as string,
        titulo:      data!.titulo      as string,
        categoria:   data!.categoria   as string,
        prioridad:   data!.prioridad   as string,
        descripcion: data!.descripcion as string | null,
        asignadoA:   data!.asignado_a  as string | null,
        source:      'portal',
        submittedBy,
        portalUrl,
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ ticket: data }, { status: 201 });
}
