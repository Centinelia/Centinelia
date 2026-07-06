import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { identificador } = body.toolCallList?.[0]?.function?.arguments ?? body;

  if (!agent_id || !identificador) {
    return NextResponse.json({ error: 'agent_id e identificador requeridos' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const normId   = identificador.replace(/\D/g, '');

  const [callsRes, leadsRes, ordersRes, apptsRes] = await Promise.all([
    supabase.from('voice_calls')
      .select('caller_number, summary, outcome, created_at')
      .eq('agent_id', agent_id)
      .ilike('caller_number', `%${normId || identificador}%`)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('leads_voice')
      .select('nombre, negocio, servicio, email, whatsapp, created_at')
      .eq('agent_id', agent_id)
      .or(`nombre.ilike.%${identificador}%,whatsapp.ilike.%${normId || identificador}%`)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('orders_voice')
      .select('nombre, items, status, created_at')
      .eq('agent_id', agent_id)
      .or(`nombre.ilike.%${identificador}%,telefono.ilike.%${normId || identificador}%`)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('appointments_voice')
      .select('nombre, servicio, fecha, hora, status, created_at')
      .eq('agent_id', agent_id)
      .or(`nombre.ilike.%${identificador}%,telefono.ilike.%${normId || identificador}%`)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const calls  = callsRes.data  ?? [];
  const leads  = leadsRes.data  ?? [];
  const orders = ordersRes.data ?? [];
  const appts  = apptsRes.data  ?? [];

  if (calls.length === 0 && leads.length === 0 && orders.length === 0 && appts.length === 0) {
    return NextResponse.json({
      result: 'No encontré registros previos de ese cliente. ¿Le puedo ayudar como cliente nuevo?',
      found: false,
    });
  }

  const parts: string[] = [];

  const lead = leads[0];
  if (lead?.nombre)  parts.push(`Nombre: ${lead.nombre}`);
  if (lead?.negocio) parts.push(`Negocio: ${lead.negocio}`);
  if (lead?.servicio) parts.push(`Servicio de interés anterior: ${lead.servicio}`);
  if (lead?.email)   parts.push(`Email: ${lead.email}`);

  if (calls.length > 0) {
    const lastCall = calls[0];
    const { data: agentRow } = await supabase.from('voice_agents').select('timezone').eq('id', agent_id).single();
    const tz = agentRow?.timezone ?? 'America/Monterrey';
    const lastDate = new Date(lastCall.created_at).toLocaleDateString('es-MX', {
      timeZone: tz, day: 'numeric', month: 'long', year: 'numeric',
    });
    parts.push(`Ha llamado ${calls.length} vez${calls.length > 1 ? 'es' : ''}. Última vez: ${lastDate}.`);
    if (lastCall.summary) parts.push(`Última llamada: ${lastCall.summary}`);
  }

  const pendingAppts = appts.filter((a: any) => a.status === 'confirmada');
  if (pendingAppts.length > 0) {
    const a = pendingAppts[0];
    parts.push(`Cita agendada: ${a.servicio ?? ''} el ${a.fecha ?? '?'} a las ${a.hora ?? '?'}.`);
  }

  const pendingOrders = orders.filter((o: any) => o.status === 'nuevo' || o.status === 'en_proceso');
  if (pendingOrders.length > 0) {
    parts.push(`Pedido pendiente: ${pendingOrders[0].items ?? ''}.`);
  }

  return NextResponse.json({
    result: parts.join(' '),
    found: true,
    nombre: lead?.nombre ?? null,
  });
}
