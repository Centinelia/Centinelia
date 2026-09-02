import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { nombre, servicio, fecha, hora, email, whatsapp_cliente } = args;

  if (!agent_id || !nombre || !fecha || !hora) {
    return NextResponse.json({ result: 'Faltan datos para agendar la cita. Pide nombre, fecha y hora al cliente.' });
  }

  const supabase = createAdminClient();
  // Calendar es org-level (migrado 2026-08-09).
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, transfer_whatsapp')
    .eq('id', agent_id)
    .single();

  if (!agent) return NextResponse.json({ result: 'Error interno al agendar la cita.' });

  const { data: org } = agent.portal_email
    ? await supabase
        .from('organizations')
        .select('calendar_type, calendar_api_key, calendar_event_type_id, calendar_link')
        .eq('portal_email', agent.portal_email)
        .maybeSingle()
    : { data: null };

  // 1. Always save to Supabase
  const fechaIso = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;
  await supabase.from('appointments_voice').insert({
    agent_id: agent_id,
    nombre,
    telefono:  whatsapp_cliente ?? null,
    servicio:  servicio ?? null,
    fecha,
    hora,
    fecha_iso: fechaIso,
    status:    'confirmada',
  });

  // 2. Try Cal.com API if configured
  let calBooked = false;
  if (org?.calendar_type === 'cal_com' && org.calendar_api_key && org.calendar_event_type_id) {
    try {
      // Build ISO datetime, assumes Mexico City timezone
      const startIso = fechaIso
        ? new Date(`${fechaIso}T${hora}:00-06:00`).toISOString()
        : null;

      if (startIso) {
        const calRes = await fetch(`https://api.cal.com/v1/bookings?apiKey=${org.calendar_api_key}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventTypeId: parseInt(org.calendar_event_type_id),
            start:       startIso,
            name:        nombre,
            email:       email ?? `llamada@centinelia.mx`,
            timeZone:    'America/Monterrey',
            language:    'es',
            notes:       `Cita agendada por agente de voz Centinelia para ${agent.business_name}`,
            ...(servicio && { customInputs: [{ label: 'Servicio', value: servicio }] }),
          }),
        });

        if (calRes.ok) {
          calBooked = true;
          // Cost-based charge: Cal.com booking real via API paga.
          await consumeAiOp(agent_id, 1, {
            source: 'calcom_booking',
            label:  'Cita agendada en Cal.com',
          });
        } else {
          console.error('[agendar-cita-externa] Cal.com error:', await calRes.text());
        }
      }
    } catch (e) {
      console.error('[agendar-cita-externa] Cal.com exception:', e);
    }
  }

  // 3. Notify business owner
  if (agent.transfer_whatsapp) {
    const ownerMsg = `📅 *Nueva cita, ${agent.business_name}*\n\nCliente: ${nombre}\nServicio: ${servicio ?? ','}\nFecha: ${fecha} · ${hora}${whatsapp_cliente ? `\nWA: ${whatsapp_cliente}` : ''}${calBooked ? '\n✅ Confirmada en Cal.com' : org?.calendar_link ? '\n📎 Link enviado al cliente' : ''}`;
    const waOk = await sendWhatsApp(agent.transfer_whatsapp, ownerMsg).catch(err => {
      console.error(err);
      return false;
    });
    if (waOk) {
      await consumeAiOp(agent_id, 1, {
        source: 'whatsapp_notify_owner',
        label:  'WhatsApp al encargado',
      });
    }
  }

  const result = calBooked
    ? `Cita confirmada directamente en el calendario de ${agent.business_name}.`
    : org?.calendar_link
      ? `Datos de la cita registrados. Comparte el link de reserva con el cliente para que confirme.`
      : `Cita registrada: ${nombre}, ${servicio ?? 'sin servicio'}, ${fecha} a las ${hora}.`;

  return NextResponse.json({ result });
}
