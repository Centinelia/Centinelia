import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { getNextTicketFolio } from '@/lib/helpdesk/folio';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sp        = req.nextUrl.searchParams;
  const status    = sp.get('status');
  const categoria = sp.get('categoria');

  const supabase = createAdminClient();
  let q = supabase
    .from('helpdesk_tickets')
    .select('*')
    .in('agent_id', access.ids)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status)    q = q.eq('status', status);
  if (categoria) q = q.eq('categoria', categoria);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const access    = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
  return NextResponse.json({ ticket: data }, { status: 201 });
}
