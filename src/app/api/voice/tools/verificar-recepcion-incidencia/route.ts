import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verificarRecepcionIncidencia } from '@/lib/tools/executors/verificar-recepcion-incidencia';

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
      return NextResponse.json({ results: [{ toolCallId, result: { error: 'agent not found' } }] });
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
    // Formato {result: string} — mismo cambio que registrar-incidencia (ver 2026-08-28).
    const emailSuffix = result.email_sent ? ' Correo enviado al encargado.' : '';
    const msg = result.verification_result === 'ok'
      ? `Verificación registrada como recibida. Caso cerrado.${emailSuffix}`
      : result.verification_result === 'no_visitado'
      ? `Verificación registrada como NO visitado — queda en rojo en la bitácora esta semana.${emailSuffix}`
      : `Verificación registrada como sin respuesta — queda en gris en la bitácora.${emailSuffix}`;
    return NextResponse.json({ result: msg });
  } catch (err: any) {
    console.error('[verificar_recepcion_incidencia] unhandled:', err);
    return NextResponse.json({ result: `Error al registrar la verificación: ${err?.message ?? 'error interno'}.` });
  }
}
