import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { accion, nombre, servicio, fecha, hora, telefono } =
    body.toolCallList?.[0]?.function?.arguments ?? body;

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, calendar_url, transfer_whatsapp, timezone')
    .eq('id', agent_id)
    .single();

  // Save or update appointment in database
  if (accion === 'agendar') {
    await supabase.from('appointments_voice').insert({
      agent_id,
      nombre:   nombre   ?? null,
      telefono: telefono ?? null,
      servicio: servicio ?? null,
      fecha:    fecha    ?? null,
      hora:     hora     ?? null,
      status:   'confirmada',
    });
  } else if (accion === 'cancelar' && telefono) {
    // Mark most recent matching appointment as cancelled
    await supabase
      .from('appointments_voice')
      .update({ status: 'cancelada' })
      .eq('agent_id', agent_id)
      .eq('telefono', telefono)
      .eq('status', 'confirmada');
  } else if (accion === 'modificar') {
    // Cancel old + create new
    if (telefono) {
      await supabase
        .from('appointments_voice')
        .update({ status: 'cancelada' })
        .eq('agent_id', agent_id)
        .eq('telefono', telefono)
        .eq('status', 'confirmada');
    }
    await supabase.from('appointments_voice').insert({
      agent_id,
      nombre:   nombre   ?? null,
      telefono: telefono ?? null,
      servicio: servicio ?? null,
      fecha:    fecha    ?? null,
      hora:     hora     ?? null,
      status:   'confirmada',
    });
  }

  // Notify owner via WhatsApp
  if (agent?.transfer_whatsapp) {
    const accionLabel = { agendar: '📅 Nueva cita', modificar: '✏️ Cita modificada', cancelar: '❌ Cita cancelada' }[accion as string] ?? '📅 Cita';
    const msg = [
      `${accionLabel}, *${agent.business_name}*`,
      nombre   ? `👤 ${nombre}`   : null,
      servicio ? `📋 ${servicio}` : null,
      fecha    ? `📅 ${fecha}${hora ? ` a las ${hora}` : ''}` : null,
      telefono ? `📱 ${telefono}` : null,
      agent.calendar_url ? `🔗 ${agent.calendar_url}` : null,
    ].filter(Boolean).join('\n');

    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  const responses: Record<string, string> = {
    agendar:   `Perfecto, le agendaremos una cita para el ${fecha}${hora ? ` a las ${hora}` : ''}. Recibirá una confirmación pronto.`,
    modificar: `Listo, modificamos su cita para el ${fecha}${hora ? ` a las ${hora}` : ''}. Le confirmamos los cambios pronto.`,
    cancelar:  `Su cita ha sido cancelada. Si necesita reagendar estamos a sus órdenes.`,
  };

  return NextResponse.json({
    result: responses[accion as string] ?? 'Solicitud de cita procesada.',
    calendar_url: agent?.calendar_url ?? null,
  });
}
