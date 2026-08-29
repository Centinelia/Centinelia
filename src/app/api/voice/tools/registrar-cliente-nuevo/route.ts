import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarClienteNuevo } from '@/lib/tools/executors/registrar-cliente-nuevo';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let debugAgentId: string | null = null;
  let debugBodyStr: string | null = null;
  let toolCallId: string | undefined;
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent_id');
    debugAgentId = agentId;
    if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

    const body = await req.json();
    debugBodyStr = JSON.stringify(body).slice(0, 2000);
    const toolCall = body?.message?.toolCallList?.[0] ?? body?.message?.toolCalls?.[0];
    toolCallId = toolCall?.id ?? toolCall?.toolCallId;
    const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
    const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

    // Trace persistente para debug post-facto (paridad con registrar_incidencia).
    // Best effort, no bloquea el flow.
    try {
      const traceSupabase = createAdminClient();
      await traceSupabase.from('tool_call_log').insert({
        agent_id:    agentId,
        channel:     'voice',
        tool_name:   'registrar_cliente_nuevo',
        input_json:  { args, body_head: debugBodyStr.slice(0, 500), toolCallId },
        ok:          true,
        latency_ms:  0,
        attempt:     1,
      });
    } catch (traceErr) {
      console.warn('[registrar_cliente_nuevo] trace log failed:', traceErr);
    }

    const supabase = createAdminClient();
    const { data: agent, error: agentErr } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
    if (agentErr || !agent) {
      console.error('[registrar_cliente_nuevo] agent lookup failed:', agentErr);
      return NextResponse.json({ result: 'No pude encontrar la configuración del agente.' });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('directory')
      .eq('portal_email', agent.portal_email)
      .single();

    const callId = body?.message?.call?.id ?? null;
    const { data: voiceCall } = callId
      ? await supabase.from('voice_calls').select('id').eq('vapi_call_id', callId).maybeSingle()
      : { data: null };

    // Guardrail contra empty-args (mismo patrón que registrar_incidencia).
    if (!args?.business_name || !args?.contact_phone || !args?.address) {
      const missing = [
        !args?.business_name && 'business_name',
        !args?.contact_phone && 'contact_phone',
        !args?.address       && 'address',
      ].filter(Boolean).join(', ');
      return NextResponse.json({
        result: `No pude dar de alta al cliente: faltan campos requeridos (${missing}). Vuelve a llamar registrar_cliente_nuevo con TODOS los datos ya capturados: business_name, contact_phone, address. Sucursal, contact_name y notas son opcionales pero úsalos si los tienes.`,
      });
    }

    const result = await registrarClienteNuevo(
      {
        supabase,
        agent,
        org,
        channel: 'voice',
        sourceCallId: voiceCall?.id ?? null,
      },
      args,
    );

    const msg = result.email_sent
      ? 'Listo, ya di de alta al cliente y avisé al encargado para que le llame a tomar el pedido.'
      : 'Listo, ya di de alta al cliente. No pude avisar al encargado por correo (no hay encargado configurado), pero los datos quedaron guardados.';
    return NextResponse.json({ result: msg });
  } catch (err: any) {
    console.error('[registrar_cliente_nuevo] unhandled:', err, { debugAgentId, debugBodyStr });
    try {
      const traceSupabase = createAdminClient();
      await traceSupabase.from('tool_call_log').insert({
        agent_id:    debugAgentId ?? '00000000-0000-0000-0000-000000000000',
        channel:     'voice',
        tool_name:   'registrar_cliente_nuevo',
        input_json:  { body_head: debugBodyStr ?? 'no-body', toolCallId },
        output_json: { error: err?.message ?? 'error interno' },
        ok:          false,
        error:       err?.message ?? 'error interno',
        latency_ms:  0,
        attempt:     1,
      });
    } catch { /* best effort */ }
    return NextResponse.json({ result: `Error al dar de alta al cliente: ${err?.message ?? 'error interno'}. Intenta capturar los datos de nuevo.` });
  }
}
