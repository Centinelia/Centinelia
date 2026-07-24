import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { getNextTicketFolio } from '@/lib/helpdesk/folio';
import { sendEmail } from '@/lib/email/send';
import { ticketEmailHtml } from '@/lib/ops/approval-email';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { cookies } from 'next/headers';

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
  };
  if (!body.titulo) return NextResponse.json({ error: 'Título requerido' }, { status: 400 });

  // Nuevos tickets se crean bajo el agente primario del portal
  const folio = await getNextTicketFolio(access.primaryId, supabase);
  const { data, error } = await supabase
    .from('helpdesk_tickets')
    .insert({
      agent_id:      access.primaryId,
      folio,
      titulo:        body.titulo,
      categoria:     body.categoria    ?? 'otro',
      prioridad:     body.prioridad    ?? 'normal',
      descripcion:   body.descripcion  ?? null,
      asignado_a:    body.asignado_a   ?? null,
      asignado_tel:  body.asignado_tel ?? null,
      caller_number: body.caller_number ?? null,
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
