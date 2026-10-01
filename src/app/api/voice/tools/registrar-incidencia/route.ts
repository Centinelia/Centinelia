import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { registrarIncidencia } from '@/lib/tools/executors/registrar-incidencia';
import { withDedup } from '@/lib/tools/dedup/with-dedup';
import { toolResponse } from '@/lib/voice/tool-response';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let toolCallId: string | undefined;
  let debugAgentId: string | null = null;
  let debugBodyStr: string | null = null;
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

    // Trace persistente para debug post-facto (bug 2026-08-28: Vapi request-start
    // fire pero endpoint nunca crea row → sospecha payload shape distinto). Best
    // effort, no bloquea el flow.
    try {
      const traceSupabase = createAdminClient();
      await traceSupabase.from('tool_call_log').insert({
        agent_id:    agentId,
        channel:     'voice',
        tool_name:   'registrar_incidencia',
        input_json:  { args, body_head: debugBodyStr.slice(0, 500), toolCallId },
        ok:          true,
        latency_ms:  0,
        attempt:     1,
      });
    } catch (traceErr) {
      console.warn('[registrar_incidencia] trace log failed:', traceErr);
    }

    const supabase = createAdminClient();
    const { data: agent, error: agentErr } = await supabase.from('voice_agents').select('*').eq('id', agentId).single();
    if (agentErr || !agent) {
      console.error('[registrar_incidencia] agent lookup failed:', agentErr);
      return toolResponse(toolCallId ?? '', 'No pude encontrar la configuración del agente.');
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

    // Guardrail contra empty-args: Haiku a veces invoca la tool con
    // arguments={} pensando que ya pasó los datos en la voz. Mensaje explícito
    // para que reintente con los campos que ya capturó (evita loop de 8x
    // "Ya notifico al encargado" cuando validatePhoneOrThrow crashea con
    // undefined).
    if (!args?.business_name || !args?.contact_phone || !args?.address || !args?.motivo) {
      const missing = [
        !args?.business_name && 'business_name',
        !args?.contact_phone && 'contact_phone',
        !args?.address       && 'address',
        !args?.motivo        && 'motivo',
      ].filter(Boolean).join(', ');
      return toolResponse(
        toolCallId ?? '',
        `No pude registrar la incidencia: faltan campos requeridos (${missing}). Vuelve a llamar registrar_incidencia con TODOS los datos que ya capturaste del cliente: business_name (nombre del negocio), contact_phone (teléfono), address (dirección completa), motivo (queja con las palabras del cliente). No dejes ninguno vacío.`,
      );
    }

    const result = await withDedup(
      {
        agentId,
        portalEmail: agent.portal_email,
        toolName:    'registrar_incidencia',
        args,
        channel:     'voice',
        toolCallId,
      },
      () => registrarIncidencia(
        {
          supabase,
          agent,
          org,
          channel: 'voice',
          sourceCallId: voiceCall?.id ?? null,
        },
        args,
      ),
    );
    // Response wrap custom-LLM: Vapi con provider=custom-llm (Nelia Tortillería
    // desde Sonnet 5.5 rollout 2026-09-28) requiere `{results:[{toolCallId,result:"<string>"}]}`.
    // Bug 2026-08-28 era que usábamos `result:{obj}` (objeto) — eso sí rompía.
    // Con result:"string" dentro del wrap funciona. Bug 2026-10-01 (Rosendo
    // Ramírez): sin el wrap Vapi devolvía "No result returned" al modelo
    // aunque el server había ejecutado todo bien, Nelia pensaba que falló y
    // mandaba reportar_falla innecesariamente. toolResponse() usa el wrap si
    // viene toolCallId; cae a {result:msg} si no (backwards-compat para tests
    // y llamadas legacy sin toolCallList).
    const msg = result.email_sent
      ? 'Registrado. Correo enviado al encargado y llamada de verificación agendada para dentro de 3 días.'
      : 'Registrado en el sistema. No pude notificar al encargado por correo (no hay encargado configurado), pero quedó agendada la llamada de verificación en 3 días.';
    return toolResponse(toolCallId ?? '', msg);
  } catch (err: any) {
    console.error('[registrar_incidencia] unhandled:', err, { debugAgentId, debugBodyStr });
    // Trace del error también
    try {
      const traceSupabase = createAdminClient();
      await traceSupabase.from('tool_call_log').insert({
        agent_id:    debugAgentId ?? '00000000-0000-0000-0000-000000000000',
        channel:     'voice',
        tool_name:   'registrar_incidencia',
        input_json:  { body_head: debugBodyStr ?? 'no-body' },
        output_json: { error: err?.message ?? 'error interno' },
        ok:          false,
        error:       err?.message ?? 'error interno',
        latency_ms:  0,
        attempt:     1,
      });
    } catch { /* best effort */ }
    return toolResponse(
      toolCallId ?? '',
      `Error al registrar la incidencia: ${err?.message ?? 'error interno'}. Intenta capturar los datos de nuevo.`,
    );
  }
}
