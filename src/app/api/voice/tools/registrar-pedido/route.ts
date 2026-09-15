import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const args = (body.message?.toolCallList ?? body.toolCallList)?.[0]?.function?.arguments ?? body;
  const { nombre, telefono, items, tipo, direccion, notas } = args;
  const startedAt = Date.now();
  const sessionId = (body.message?.call?.id as string) ?? null;

  if (!agent_id) return NextResponse.json({ result: 'Error de configuración.' });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp')
    .eq('id', agent_id)
    .single();

  // Save order to database
  const { data: orderRow } = await supabase.from('orders_voice').insert({
    agent_id,
    nombre:    nombre    ?? null,
    telefono:  telefono  ?? null,
    items:     items     ?? '',
    tipo:      tipo      ?? 'recoger',
    direccion: direccion ?? null,
    notas:     notas     ?? null,
    status:    'nuevo',
  }).select('id').single();

  // Cobro base work-based: registrar un pedido es trabajo del meerkat aunque
  // no dispare notificación externa. try/catch para no abortar si el pool
  // está en overage — el pedido ya se registró; drift detector recupera.
  try {
    await consumeAiOp(agent_id, 1, {
      source: 'order_registered',
      label:  'Registro de pedido',
      reference_id: orderRow?.id as string | undefined,
    });
  } catch (err) {
    console.error('registrar_pedido consumeAiOp base failed silently:', err);
  }

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

    const waOk = await sendWhatsApp(agent.transfer_whatsapp, msg);
    if (waOk) {
      await consumeAiOp(agent_id, 1, {
        source: 'whatsapp_notify_owner',
        label:  'WhatsApp al encargado',
      });
    }
  }

  const tipoLabel = tipo === 'entrega' ? 'entrega a domicilio' : 'recoger en sucursal';
  const msg = `Su pedido ha sido registrado para ${tipoLabel}. Le confirmamos los detalles por teléfono pronto.`;
  traceVoiceCall({
    toolName: 'registrar_pedido', agentId: agent_id, sessionId, input: args,
    result: { ok: true, tipo, items, nombre, telefono }, startedAt,
  });
  return NextResponse.json({ result: msg });
}
