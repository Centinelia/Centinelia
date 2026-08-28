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

    const result = await verificarRecepcionIncidencia({ supabase, agent }, args);
    // Formato {result: string} — mismo cambio que registrar-incidencia (ver 2026-08-28).
    const msg = result.verification_result === 'ok'
      ? 'Verificación registrada como recibida. Caso cerrado.'
      : result.verification_result === 'no_visitado'
      ? 'Verificación registrada como NO visitado — queda en rojo en la bitácora esta semana.'
      : 'Verificación registrada como sin respuesta — queda en gris en la bitácora.';
    return NextResponse.json({ result: msg });
  } catch (err: any) {
    console.error('[verificar_recepcion_incidencia] unhandled:', err);
    return NextResponse.json({ result: `Error al registrar la verificación: ${err?.message ?? 'error interno'}.` });
  }
}
