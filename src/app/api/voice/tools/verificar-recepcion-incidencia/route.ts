import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verificarRecepcionIncidencia } from '@/lib/tools/executors/verificar-recepcion-incidencia';
import { toolResponse } from '@/lib/voice/tool-response';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let toolCallId: string | undefined;
  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent_id');
    if (!agentId) return NextResponse.json({ error: 'agent_id required' }, { status: 400 });

    const body = await req.json();
    const toolCall = body?.message?.toolCallList?.[0] ?? body?.message?.toolCalls?.[0];
    toolCallId = toolCall?.id ?? toolCall?.toolCallId;
    const rawArgs = toolCall?.function?.arguments ?? toolCall?.arguments ?? {};
    const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

    const supabase = createAdminClient();
    const { data: agent, error: agentErr } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
    if (agentErr || !agent) {
      console.error('[verificar_recepcion_incidencia] agent lookup failed:', agentErr);
      return toolResponse(toolCallId ?? '', 'No pude encontrar la configuración del agente.');
    }

    // Cargar directory de la org para que el executor pueda mandar el correo
    // tarjeta con el resultado a los mismos recipients del inicial.
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('directory')
      .eq('portal_email', agent.portal_email)
      .single();
    if (orgErr) console.warn('[verificar_recepcion_incidencia] org lookup warning:', orgErr.message);

    const result = await verificarRecepcionIncidencia({ supabase, agent, org, channel: 'voice' }, args);
    // Response wrap custom-LLM: mismo fix que registrar-incidencia 2026-10-01.
    // Vapi en custom-LLM mode traduce {result:msg} legacy como "No result
    // returned" al modelo, haciendo que Nelia piense que falló y reporte
    // bug innecesariamente. toolResponse() envuelve si viene toolCallId;
    // cae a flat si no (backwards-compat).
    const emailSuffix = result.email_sent ? ' Correo enviado al encargado.' : '';
    const msg = result.verification_result === 'ok'
      ? `Verificación registrada como recibida. Caso cerrado.${emailSuffix}`
      : result.verification_result === 'no_visitado'
      ? `Verificación registrada como NO visitado — queda en rojo en la bitácora esta semana.${emailSuffix}`
      : `Verificación registrada como sin respuesta — queda en gris en la bitácora.${emailSuffix}`;
    return toolResponse(toolCallId ?? '', msg);
  } catch (err: any) {
    console.error('[verificar_recepcion_incidencia] unhandled:', err);
    return toolResponse(toolCallId ?? '', `Error al registrar la verificación: ${err?.message ?? 'error interno'}.`);
  }
}
