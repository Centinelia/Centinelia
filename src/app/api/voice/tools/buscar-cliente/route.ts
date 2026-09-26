import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { identificador } = args;
  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;

  // Vapi no le pasa el numero del llamante al modelo, pero SI viene en el body del webhook.
  // Usamos ese numero como criterio automatico ademas del identificador que el modelo dio.
  // Asi aunque Nia llame buscar_cliente(identificador='Nash Reanzar') sin saber su telefono,
  // la tool encuentra las llamadas previas del mismo numero.
  const callerPhoneRaw: string = body.message?.call?.customer?.number ?? body.message?.customer?.number ?? '';
  const callerPhoneNorm = callerPhoneRaw.replace(/\D/g, '').slice(-10);

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });
  if (!identificador && !callerPhoneNorm) return NextResponse.json({ result: 'Necesito que me indiques qué cliente buscar.' });

  const supabase = createAdminClient();
  const idOrEmpty = identificador ?? '';
  const normId    = idOrEmpty.replace(/\D/g, '');
  // Phone que usaremos como criterio primario: el del caller si vino, si no el que dio el modelo.
  const phoneCriterion = callerPhoneNorm || normId || idOrEmpty;
  // Texto para busqueda por nombre: lo que el modelo dio, si no es puros digitos.
  const nameCriterion  = idOrEmpty && !/^\d+$/.test(idOrEmpty) ? idOrEmpty : '';

  const [callsRes, leadsRes, ordersRes, apptsRes] = await Promise.all([
    supabase.from('voice_calls')
      .select('caller_number, summary, outcome, duration_seconds, created_at')
      .eq('agent_id', agent_id)
      .ilike('caller_number', `%${phoneCriterion}%`)
      .not('summary', 'is', null)
      .neq('outcome', 'unanswered')
      .gte('duration_seconds', 30) // Excluye llamadas <30s: no tienen contenido util y confunden al modelo
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('leads_voice')
      .select('nombre, negocio, servicio, email, whatsapp, created_at')
      .eq('agent_id', agent_id)
      .or(
        nameCriterion
          ? `nombre.ilike.%${nameCriterion}%,whatsapp.ilike.%${phoneCriterion}%`
          : `whatsapp.ilike.%${phoneCriterion}%`
      )
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('orders_voice')
      .select('nombre, items, status, created_at')
      .eq('agent_id', agent_id)
      .or(
        nameCriterion
          ? `nombre.ilike.%${nameCriterion}%,telefono.ilike.%${phoneCriterion}%`
          : `telefono.ilike.%${phoneCriterion}%`
      )
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('appointments_voice')
      .select('nombre, servicio, fecha, hora, status, created_at')
      .eq('agent_id', agent_id)
      .or(
        nameCriterion
          ? `nombre.ilike.%${nameCriterion}%,telefono.ilike.%${phoneCriterion}%`
          : `telefono.ilike.%${phoneCriterion}%`
      )
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const calls  = callsRes.data  ?? [];
  const leads  = leadsRes.data  ?? [];
  const orders = ordersRes.data ?? [];
  const appts  = apptsRes.data  ?? [];

  if (calls.length === 0 && leads.length === 0 && orders.length === 0 && appts.length === 0) {
    traceVoiceCall({
      toolName: 'buscar_cliente', agentId: agent_id, sessionId, input: args,
      result: { ok: true, found: false }, startedAt,
    });
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
    const { data: agentRow } = await supabase.from('voice_agents').select('timezone').eq('id', agent_id).single();
    const tz = agentRow?.timezone ?? 'America/Monterrey';
    const veces = calls.length === 1 ? 'vez' : 'veces';
    parts.push(`Ha llamado ${calls.length} ${veces} en total. Historial reciente:`);
    // Devolvemos hasta 3 llamadas para que el modelo tenga contexto sobre DE QUE se hablo,
    // no solo la ultima (que puede ser una llamada trunca sin contenido util).
    for (const c of calls.slice(0, 3)) {
      const date = new Date(c.created_at).toLocaleDateString('es-MX', {
        timeZone: tz, day: 'numeric', month: 'long',
      });
      parts.push(`• ${date}: ${c.summary}`);
    }
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

  const msg = parts.join(' ');
  traceVoiceCall({
    toolName: 'buscar_cliente', agentId: agent_id, sessionId, input: args,
    result: { ok: true, found: true, nombre: lead?.nombre ?? null, calls: calls.length, leads: leads.length, orders: orders.length, appts: appts.length },
    startedAt,
  });
  return NextResponse.json({
    result: msg,
    found: true,
    nombre: lead?.nombre ?? null,
  });
}
