import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';
import { withDedup } from '@/lib/tools/dedup/with-dedup';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args, sessionId } = extractToolCall(body);
  const { nombre, telefono, items, tipo, direccion, notas } = args as {
    nombre?: string; telefono?: string; items?: string; tipo?: string; direccion?: string; notas?: string;
  };
  const startedAt = Date.now();

  if (!agent_id) return toolResponse(toolCallId, 'Error de configuración.');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp, portal_email')
    .eq('id', agent_id)
    .single();

  const msg = await withDedup(
    {
      agentId:     agent_id,
      portalEmail: (agent as { portal_email?: string })?.portal_email ?? '',
      toolName:    'registrar_pedido',
      args:        args as Record<string, unknown>,
      channel:     'voice',
      toolCallId,
    },
    async () => {
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

      try {
        await consumeAiOp(agent_id, 1, {
          source: 'order_registered',
          label:  'Registro de pedido',
          reference_id: orderRow?.id as string | undefined,
        });
      } catch (err) {
        console.error('registrar_pedido consumeAiOp base failed silently:', err);
      }

      if (agent?.transfer_whatsapp) {
        const notif = [
          `🛒 *Nuevo pedido, ${agent.business_name}*`,
          nombre   ? `👤 ${nombre}`   : null,
          telefono ? `📱 ${telefono}` : null,
          `📦 ${items}`,
          tipo === 'entrega' ? `🚚 Entrega a: ${direccion ?? 'por confirmar'}` : '🏪 Para recoger en sucursal',
          notas    ? `📝 ${notas}`    : null,
        ].filter(Boolean).join('\n');

        const waOk = await sendWhatsApp(agent.transfer_whatsapp, notif);
        if (waOk) {
          await consumeAiOp(agent_id, 1, {
            source: 'whatsapp_notify_owner',
            label:  'WhatsApp al encargado',
          });
        }
      }

      const tipoLabel = tipo === 'entrega' ? 'entrega a domicilio' : 'recoger en sucursal';
      return `Su pedido ha sido registrado para ${tipoLabel}. Le confirmamos los detalles por teléfono pronto.`;
    },
  );

  traceVoiceCall({
    toolName: 'registrar_pedido', agentId: agent_id, sessionId, input: args,
    result: { ok: true, tipo, items, nombre, telefono }, startedAt,
  });
  return toolResponse(toolCallId, msg);
}
