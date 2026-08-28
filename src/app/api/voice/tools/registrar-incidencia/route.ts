import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarIncidencia } from '@/lib/tools/executors/registrar-incidencia';

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
      console.error('[registrar_incidencia] agent lookup failed:', agentErr);
      return NextResponse.json({ results: [{ toolCallId, result: { error: 'agent not found' } }] });
    }

    // NOTA: organizations NO tiene columna `features` — solo `directory` +
    // columnas bare como incidencia_flow_enabled, ops_ledger_enabled, etc.
    // Bug 2026-08-28: SELECT directory, features tiraba PostgrestError y el
    // 500 hacía a Vapi reintentar la tool call, causando el flow buggeado
    // que Nelia repetía preguntas.
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('directory')
      .eq('portal_email', agent.portal_email)
      .single();
    if (orgErr) console.warn('[registrar_incidencia] org lookup warning:', orgErr.message);

    const callId = body?.message?.call?.id ?? null;
    const { data: voiceCall } = callId
      ? await supabase.from('voice_calls').select('id').eq('vapi_call_id', callId).maybeSingle()
      : { data: null };

    const result = await registrarIncidencia(
      {
        supabase,
        agent,
        org,
        channel: 'voice',
        sourceCallId: voiceCall?.id ?? null,
      },
      args,
    );
    // Formato {result: string} — probado en registrar_pedido, funciona sin
    // problemas con el retry loop de Vapi. Antes usábamos
    // {results:[{toolCallId,result:{obj}}]} pero Vapi retriaba porque no
    // reconocía el ack — 8x "Ya notifico" en un solo call, cero rows en DB
    // pese a endpoint respondiendo 200. Ver smoke 2026-08-28 18:15 UTC.
    const msg = result.email_sent
      ? 'Registrado. Correo enviado al encargado y llamada de verificación agendada para dentro de 3 días.'
      : 'Registrado en el sistema. No pude notificar al encargado por correo (no hay encargado configurado), pero quedó agendada la llamada de verificación en 3 días.';
    return NextResponse.json({ result: msg });
  } catch (err: any) {
    console.error('[registrar_incidencia] unhandled:', err);
    return NextResponse.json({ result: `Error al registrar la incidencia: ${err?.message ?? 'error interno'}. Intenta capturar los datos de nuevo.` });
  }
}
