import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { nombre, telefono, items, tipo, direccion, notas } =
    (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp')
    .eq('id', agent_id)
    .single();

  // Save order to database
  await supabase.from('orders_voice').insert({
    agent_id,
    nombre:    nombre    ?? null,
    telefono:  telefono  ?? null,
    items:     items     ?? '',
    tipo:      tipo      ?? 'recoger',
    direccion: direccion ?? null,
    notas:     notas     ?? null,
    status:    'nuevo',
  });

  // Notify owner via WhatsApp
  if (agent?.transfer_whatsapp) {
    const msg = [
      `🛒 *Nuevo pedido, ${agent.business_name}*`,
      nombre   ? `👤 ${nombre}`   : null,
      telefono ? `📱 ${telefono}` : null,
      `📦 ${items}`,
      tipo === 'entrega' ? `🚚 Entrega a: ${direccion ?? 'por confirmar'}` : '🏪 Para recoger en sucursal',
      notas    ? `📝 ${notas}`    : null,
    ].filter(Boolean).join('\n');

    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  const tipoLabel = tipo === 'entrega' ? 'entrega a domicilio' : 'recoger en sucursal';
  return NextResponse.json({
    result: `Su pedido ha sido registrado para ${tipoLabel}. Le confirmamos los detalles por teléfono pronto.`,
  });
}
