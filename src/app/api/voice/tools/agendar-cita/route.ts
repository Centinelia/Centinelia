import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { executeListCalendarEvents, executeCreateCalendarEvent } from '@/lib/services/connector-tools';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const accion:      string | undefined = args.accion;
  const nombre:      string | undefined = args.nombre;
  const servicio:    string | undefined = args.servicio;
  const fecha:       string | undefined = args.fecha;
  const hora:        string | undefined = args.hora;
  const telefono:    string | undefined = args.telefono;
  const fechaIso:    string | undefined = args.fecha_iso;
  const duracionMin: number = typeof args.duracion_min === 'number'
    ? args.duracion_min
    : (typeof args.duracion_min === 'string' ? parseInt(args.duracion_min, 10) : 60);

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, calendar_url, transfer_whatsapp, timezone')
    .eq('id', agent_id)
    .single();

  // Parsear fecha_iso + hora como Mexico City (UTC-6). Si falla, startsAt = null.
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (fechaIso && hora && /^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
    const m = hora.trim().match(/^(\d{1,2}):?(\d{2})?/);
    if (m) {
      const hh = String(parseInt(m[1], 10)).padStart(2, '0');
      const mm = m[2] ? m[2].padStart(2, '0') : '00';
      const iso = `${fechaIso}T${hh}:${mm}:00-06:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        startsAt = d;
        endsAt = new Date(d.getTime() + duracionMin * 60_000);
      }
    }
  }

  if (accion === 'agendar' || accion === 'modificar') {
    // Guard: sin fecha_iso + hora parseables no podemos detectar empalmes ni
    // sincronizar calendar. Rechazamos para que el modelo reintente con datos completos.
    if (!startsAt || !endsAt) {
      return NextResponse.json({
        result: 'No puedo confirmar la cita sin fecha exacta (YYYY-MM-DD) y hora (HH:MM 24h). Pregunta al cliente el día y hora exactos, y vuelve a llamar agendar_cita incluyendo AMBOS campos.',
      });
    }

    // Conflict check
    // 1) DB interna via starts_at (rows creadas con el nuevo path).
    const { data: dbConflicts } = await supabase
      .from('appointments_voice')
      .select('nombre, hora')
      .eq('agent_id', agent_id)
      .eq('status', 'confirmada')
      .eq('starts_at', startsAt.toISOString());
    if (dbConflicts && dbConflicts.length > 0) {
      const c = dbConflicts[0];
      return NextResponse.json({
        result: `Ese horario ya está ocupado por una cita con ${c.nombre ?? 'otro cliente'} a las ${c.hora ?? hora}. Propón al cliente un horario distinto.`,
      });
    }

    // 1b) Fallback legacy check por columna fecha string exacta con starts_at NULL.
    const { data: legacyConflicts } = await supabase
      .from('appointments_voice')
      .select('nombre, hora')
      .eq('agent_id', agent_id)
      .eq('status', 'confirmada')
      .eq('fecha', fechaIso)
      .eq('hora', hora ?? '')
      .is('starts_at', null);
    if (legacyConflicts && legacyConflicts.length > 0) {
      const c = legacyConflicts[0];
      return NextResponse.json({
        result: `Ese horario ya está ocupado por una cita con ${c.nombre ?? 'otro cliente'} a las ${c.hora ?? hora}. Propón al cliente un horario distinto.`,
      });
    }

    // 2) Google/Outlook Calendar si está conectado: overlap con eventos externos.
    const rangeStart = new Date(startsAt.getTime() - 15 * 60_000);
    const calResult = await executeListCalendarEvents(agent_id, rangeStart, endsAt, supabase);
    if (calResult.ok && Array.isArray(calResult.events)) {
      const overlapping = calResult.events.filter((e: { start: string; end: string }) => {
        const es = new Date(e.start).getTime();
        const ee = new Date(e.end).getTime();
        return es < endsAt!.getTime() && ee > startsAt!.getTime();
      });
      if (overlapping.length > 0) {
        const first = overlapping[0] as { title: string; start: string };
        const timeStr = new Date(first.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        return NextResponse.json({
          result: `El calendario ya tiene "${first.title}" a las ${timeStr}. Propón al cliente un horario distinto.`,
        });
      }
    }

    // Para modificar: cancelar cita previa del mismo telefono ANTES del insert nuevo.
    if (accion === 'modificar' && telefono) {
      await supabase
        .from('appointments_voice')
        .update({ status: 'cancelada' })
        .eq('agent_id', agent_id)
        .eq('telefono', telefono)
        .eq('status', 'confirmada');
    }

    // Insert con starts_at poblado.
    await supabase.from('appointments_voice').insert({
      agent_id,
      nombre:   nombre   ?? null,
      telefono: telefono ?? null,
      servicio: servicio ?? null,
      fecha:    fecha    ?? null,
      hora:     hora     ?? null,
      starts_at: startsAt.toISOString(),
      status:   'confirmada',
    });

    // Sync a Google/Outlook Calendar si está conectado.
    const title = `Cita ${servicio ? `— ${servicio} ` : ''}${nombre ? `(${nombre})` : ''}`.trim();
    const created = await executeCreateCalendarEvent(agent_id, {
      title,
      start: startsAt.toISOString(),
      end:   endsAt.toISOString(),
      description: telefono ? `Tel: ${telefono}` : undefined,
    }, supabase);
    if (!created.ok) {
      console.warn('[agendar-cita voice] calendar sync skipped', { agent_id, error: created.error });
    }
  } else if (accion === 'cancelar' && telefono) {
    await supabase
      .from('appointments_voice')
      .update({ status: 'cancelada' })
      .eq('agent_id', agent_id)
      .eq('telefono', telefono)
      .eq('status', 'confirmada');
  }

  // Notify owner via WhatsApp
  if (agent?.transfer_whatsapp) {
    const accionLabel = { agendar: 'Nueva cita', modificar: 'Cita modificada', cancelar: 'Cita cancelada' }[accion as string] ?? 'Cita';
    const msg = [
      `${accionLabel}, *${agent.business_name}*`,
      nombre   ? `Cliente: ${nombre}`   : null,
      servicio ? `Servicio: ${servicio}` : null,
      fecha    ? `Fecha: ${fecha}${hora ? ` a las ${hora}` : ''}` : null,
      telefono ? `Tel: ${telefono}` : null,
      agent.calendar_url ? `Link: ${agent.calendar_url}` : null,
    ].filter(Boolean).join('\n');

    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  const responses: Record<string, string> = {
    agendar:   `Perfecto, quedó agendada su cita para el ${fecha}${hora ? ` a las ${hora}` : ''}. Recibirá una confirmación pronto.`,
    modificar: `Listo, modificamos su cita para el ${fecha}${hora ? ` a las ${hora}` : ''}. Le confirmamos los cambios pronto.`,
    cancelar:  `Su cita ha sido cancelada. Si necesita reagendar estamos a sus órdenes.`,
  };

  return NextResponse.json({
    result: responses[accion as string] ?? 'Solicitud de cita procesada.',
    calendar_url: agent?.calendar_url ?? null,
  });
}
