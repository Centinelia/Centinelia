import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from '@/lib/observability/voice-trace';
import { extractToolCall, toolResponse } from '@/lib/voice/tool-response';
import { dedupLookup, dedupStore } from '@/lib/tools/dedup/with-dedup';

export async function POST(req: NextRequest) {
  if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');

  const body = await req.json();
  const { toolCallId, args, sessionId } = extractToolCall(body);
  if (!agent_id) return toolResponse(toolCallId, 'Error: agent_id requerido');

  const { numero, nombre, mensaje } = args as { numero?: string; nombre?: string; mensaje?: string };
  const startedAt = Date.now();
  const trace = (result: unknown, ok = true) => traceVoiceCall({
    toolName: 'llamar_a', agentId: agent_id, sessionId, input: args, result, ok, startedAt,
  });

  if (!numero || !mensaje) {
    trace({ error: 'missing_params' }, false);
    return toolResponse(toolCallId, 'Necesito el número de teléfono y el motivo de la llamada.');
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('id', agent_id)
    .single();
  if (!agent) return toolResponse(toolCallId, 'Error: agente no encontrado');

  if (!(agent.features as any)?.outbound_calls) {
    return toolResponse(toolCallId, 'Este agente no tiene llamadas salientes habilitadas.');
  }
  if (!agent.vapi_agent_id) {
    return toolResponse(toolCallId, 'El agente no está configurado para llamadas salientes. Resincroniza desde el portal.');
  }

  const dedupCtx = {
    agentId:     agent_id,
    portalEmail: (agent as { portal_email?: string })?.portal_email ?? '',
    toolName:    'llamar_a',
    args:        args as Record<string, unknown>,
    channel:     'voice' as const,
    toolCallId,
  };
  const cached = await dedupLookup<{ msg: string }>(dedupCtx);
  if (cached) {
    trace({ ok: true, numero, nombre, cached: true });
    return toolResponse(toolCallId, cached.msg);
  }

  const opsResult = await consumeAiOp(agent_id, 1, { source: 'tool_llamar_a', reference_id: sessionId ?? undefined, label: 'Llamada saliente iniciada' });
  if (!opsResult.ok) {
    return toolResponse(toolCallId, 'No tienes operaciones IA disponibles este mes para realizar llamadas.');
  }

  const callResult = await triggerOutboundCall({
    agent:          agent as any,
    customerNumber: numero,
    customerName:   nombre,
    motivo:         mensaje,
  });

  if (!callResult.ok) {
    trace({ error: callResult.error }, false);
    return toolResponse(toolCallId, `No pude iniciar la llamada: ${callResult.error}`);
  }

  trace({ ok: true, numero, nombre, callId: callResult.callId });
  const finalMsg = `Llamada iniciada a ${numero}${nombre ? ` (${nombre})` : ''}. Te notificaré cuando esté completa.`;
  await dedupStore(dedupCtx, { msg: finalMsg });
  return toolResponse(toolCallId, finalMsg);
}
