import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { fecha_inicio, fecha_fin } = args;

  if (!agent_id) {
    return NextResponse.json({ result: 'Error de configuración.' });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('calendar_api_key, calendar_event_type_id, timezone')
    .eq('id', agent_id)
    .single();

  if (!agent?.calendar_api_key || !agent?.calendar_event_type_id) {
    return NextResponse.json({ result: 'El calendario no está configurado. Pregunta directamente al cliente qué fecha y hora prefiere.' });
  }

  // Build date range, default: today + 7 days
  const tz = agent.timezone ?? 'America/Monterrey';
  const now = new Date();
  const startTime = fecha_inicio
    ? new Date(`${fecha_inicio}T00:00:00`).toISOString()
    : now.toISOString();
  const endTime = fecha_fin
    ? new Date(`${fecha_fin}T23:59:59`).toISOString()
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    apiKey:       agent.calendar_api_key,
    eventTypeId:  agent.calendar_event_type_id,
    startTime,
    endTime,
    timeZone:     tz,
  });

  let slots: Record<string, { time: string }[]> = {};
  try {
    const res = await fetch(`https://api.cal.com/v1/slots?${params}`);
    if (!res.ok) {
      console.error('[consultar-disponibilidad] Cal.com error:', await res.text());
      return NextResponse.json({ result: 'No pude consultar la disponibilidad en este momento. Pregunta al cliente qué fecha y hora prefiere y yo verifico al agendar.' });
    }
    const data = await res.json();
    slots = data.slots ?? {};
  } catch (e) {
    console.error('[consultar-disponibilidad] exception:', e);
    return NextResponse.json({ result: 'No pude consultar la disponibilidad en este momento. Pregunta al cliente qué fecha y hora prefiere y yo verifico al agendar.' });
  }

  // Format slots into readable Spanish text
  const days = Object.entries(slots)
    .filter(([, times]) => times.length > 0)
    .slice(0, 5); // max 5 days to keep response concise

  if (days.length === 0) {
    return NextResponse.json({ result: 'No hay horarios disponibles en los próximos 7 días. Informa al cliente y sugiere que contacte directamente al negocio.' });
  }

  const DIAS: Record<number, string> = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado' };
  const MESES: Record<number, string> = { 0: 'enero', 1: 'febrero', 2: 'marzo', 3: 'abril', 4: 'mayo', 5: 'junio', 6: 'julio', 7: 'agosto', 8: 'septiembre', 9: 'octubre', 10: 'noviembre', 11: 'diciembre' };

  const lines: string[] = ['Horarios disponibles:'];

  for (const [dateStr, times] of days) {
    const d    = new Date(`${dateStr}T12:00:00`);
    const dia  = DIAS[d.getDay()];
    const mes  = MESES[d.getMonth()];
    const num  = d.getDate();

    // Show up to 4 slots per day
    const horas = times.slice(0, 4).map(t => {
      const dt = new Date(t.time);
      const h  = dt.getHours().toString().padStart(2, '0');
      const m  = dt.getMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    });

    lines.push(`• ${dia} ${num} de ${mes}: ${horas.join(', ')}`);
  }

  lines.push('\nPresenta estas opciones al cliente y una vez que elija confirma con agendar_cita_externa.');

  return NextResponse.json({ result: lines.join('\n') });
}
