import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json() as Record<string, unknown>;
  const call = (((body.message as Record<string, unknown> | undefined)?.toolCallList ?? body.toolCallList) as Array<Record<string, unknown>> | undefined)?.[0];
  const rawArgs = (call?.function as Record<string, unknown> | undefined)?.arguments ?? body;
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs as Record<string, string>;
  const toolCallId: string = (call?.id as string) ?? 'call_1';
  const startedAt = Date.now();
  const sessionId = (((body.message as Record<string, unknown> | undefined)?.call as Record<string, unknown> | undefined)?.id as string) ?? null;

  const reply = (m: string, extra: Record<string, unknown> = {}, ok = true) => {
    traceVoiceCall({
      toolName: 'notificar_transferencia', agentId: agent_id ?? '', sessionId,
      input: args, result: { message: m, ...extra }, ok, startedAt,
    });
    return NextResponse.json({ results: [{ toolCallId, result: m, ...extra }] });
  };

  if (!agent_id) return reply('Error de configuración: falta agent_id.');

  const { nombre, motivo, resumen } = args;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, transfer_whatsapp, transfer_number')
    .eq('id', agent_id)
    .single();

  if (agent?.transfer_whatsapp) {
    const msg = [
      `📞 *Transferencia entrante, ${agent.business_name}*`,
      nombre  ? `👤 Cliente: ${nombre}`  : null,
      `📋 Motivo: ${motivo}`,
      resumen ? `📝 ${resumen}`          : null,
      `⏱️ El cliente está en línea ahora.`,
    ].filter(Boolean).join('\n');

    await sendWhatsApp(agent.transfer_whatsapp, msg);
  }

  return reply(
    'Notificación enviada. Le transfiero ahora.',
    { transfer_number: agent?.transfer_number ?? null },
  );
}
