/**
 * Nash monitor loop — corre cada 10 min desde /api/cron/nash-monitor.
 *
 * Flujo:
 *   1) Fetch agente Nash de la cuenta interna (portal_email='hola@centinelia.mx',
 *      features.meerkat_role_id='nash').
 *   2) Gate por features.nash_cron_enabled (default false para opt-in explícito).
 *   3) LLM loop con Anthropic Sonnet 4.6 + 6 tools exclusivas de Nash (F2+F3)
 *      vía executor compartido.
 *   4) Termina cuando el modelo emite stop_reason='end_turn', no invoca ninguna
 *      tool, o alcanza max_iterations (default 8).
 *   5) Todos los turnos se registran en llm_call_log con source='nash-monitor'.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeAgentTool, type AgentToolContext } from '@/lib/tools/executor';
import { logLlmCall } from '@/lib/observability/llm-log';
import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';

const MODEL           = 'claude-sonnet-4-6';
const MAX_ITERATIONS  = 8;
const MAX_TOKENS      = 4096;
const NASH_PORTAL     = 'hola@centinelia.mx';

// ── Tool schemas exclusivas de Nash (F2 + F3) ─────────────────────────────────
// Copia local intencional. Los mismos schemas están duplicados en agent-chat
// (para chat) e inbox-processor (para email); centralizarlos requeriría un
// refactor más grande que sale del scope de F4.
const NASH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'revisar_incidentes_plataforma',
    description: 'Lee las 5 fuentes de incidentes en una sola llamada: bug reports (reportar_falla), errores LLM, bandejas escaladas estancadas más de 24h, handoff replies fallidos, y agent_tasks status="failed". Deduplica automáticamente contra platform_incidents ya abiertos. Úsala como primera acción de cada ciclo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days:             { type: 'number', description: 'Ventana en días. Default 7. Máximo 30.' },
        limit_per_source: { type: 'number', description: 'Máximo de filas por fuente. Default 25.' },
      },
      required: [],
    },
  },
  {
    name: 'crear_incidente',
    description: 'Crea fila en platform_incidents con dedupe por (source, source_id). Si ya existe abierto, devuelve el id sin duplicar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:                 { type: 'string' },
        description:           { type: 'string' },
        priority:              { type: 'string', enum: ['low', 'med', 'high', 'critical'] },
        source:                { type: 'string', enum: ['bug_report', 'error_log', 'escalated_inbox', 'failed_handoff', 'agent_task', 'nash_self_discovery', 'manual'] },
        source_id:             { type: 'string' },
        affected_agent_id:     { type: 'string' },
        affected_portal_email: { type: 'string' },
      },
      required: ['title', 'description', 'priority'],
    },
  },
  {
    name: 'responder_cliente_afectado',
    description: 'Envía WhatsApp o email al cliente cuyo voice_agent está afectado por un incidente. Si pasas incidente_id, el email lleva Reply-To bidireccional: si el cliente responde, el sistema reabre el incidente automáticamente y crea un nuevo bug_report que Nash procesará en el siguiente ciclo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_id:     { type: 'string' },
        mensaje:      { type: 'string' },
        canal:        { type: 'string', enum: ['email', 'whatsapp'] },
        incidente_id: { type: 'string', description: 'Opcional pero muy recomendado: liga el email al incidente para que el cliente pueda responder y reabrir el caso.' },
      },
      required: ['agent_id', 'mensaje'],
    },
  },
  {
    name: 'enviar_a_claude_code',
    description: 'Crea GitHub issue con el prompt de trabajo. Sin NASH_GITHUB_TOKEN cae a email fallback. Marca el incidente como sent_to_claude_code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        incidente_id: { type: 'string' },
        prompt:       { type: 'string' },
        labels:       { type: 'array', items: { type: 'string' } },
      },
      required: ['incidente_id', 'prompt'],
    },
  },
  {
    name: 'escalar_al_owner',
    description: 'Notifica al owner (Nazre) por WhatsApp (OWNER_WHATSAPP) con fallback email hola@. Marca assigned_to=owner. Solo para lo crítico.',
    input_schema: {
      type: 'object' as const,
      properties: {
        razon:        { type: 'string' },
        urgencia:     { type: 'string', enum: ['low', 'med', 'high', 'critical'] },
        incidente_id: { type: 'string' },
      },
      required: ['razon'],
    },
  },
  {
    name: 'verificar_fix',
    description: 'Re-lee la señal fuente del incidente. Si desapareció → status=resolved. Si sigue → awaiting_verification.',
    input_schema: {
      type: 'object' as const,
      properties: {
        incidente_id: { type: 'string' },
      },
      required: ['incidente_id'],
    },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(nash: { agent_name: string | null }): string {
  const meerkat = MEERKAT_MAP.nash;
  const roleBlock = meerkat?.promptPersonalidad ?? '';
  const name      = nash.agent_name ?? 'Nash';
  return `Eres ${name}, Centinelia interno. Duplicas al owner en soporte y admin.

${roleBlock}

CONTEXTO DEL CICLO:
Este es un ciclo de monitoreo automático (cron cada 10 min). No hay usuario esperando respuesta. Trabajas contra la base de datos y notificaciones. Tu objetivo es cerrar cuantos incidentes puedas por ciclo con estos pasos:

1. LLAMA revisar_incidentes_plataforma con days=7 para ver señales nuevas.
2. Para cada señal RELEVANTE, decide:
   a) Si es dedupe (ya trackeada), skip.
   b) Si es cliente-facing (agent_task failed, escalated_inbox stale, failed_handoff): crear_incidente con priority=med. Si tienes affected_agent_id, llama responder_cliente_afectado con canal='email' e incidente_id pasando el id que devolvió crear_incidente. Mensaje breve de "recibimos tu reporte, ya lo estamos trabajando, te avisamos cuando esté resuelto".
   c) Si es bug de código reportado por un cliente (source='bug_report'): crear_incidente + enviar_a_claude_code con prompt completo (contexto, evidencia, reproducción sugerida, hipótesis) + responder_cliente_afectado con canal='email' e incidente_id (mismo ACK del punto b). El cliente reportó, merece confirmación de que llegó y va en proceso.
   d) Si es bug interno sin cliente identificable (error_log recurrente, patrón anómalo): crear_incidente + enviar_a_claude_code. Sin responder_cliente_afectado.
   e) Si es CRÍTICO (cobro mal aplicado, datos en riesgo, mismo incidente 3+ veces): escalar_al_owner con urgencia=critical.
3. Recorre pending_verification que devuelve revisar_incidentes_plataforma. Para cada incidente ahí (están en sent_to_claude_code o awaiting_verification), llama verificar_fix con su id. Si la fuente original desapareció, se cierra automático. Si sigue presente, queda awaiting_verification para el owner.
   3a. Si verificar_fix devuelve new_status='resolved' Y el incidente tiene affected_agent_id (o affected_portal_email), llama responder_cliente_afectado con canal='email', incidente_id (el mismo que verificaste) y un mensaje breve, cálido y directo confirmando que su reporte fue atendido. Ejemplo de tono: "Hola, quería avisarte que el problema que reportaste sobre [tema] ya está resuelto. Si vuelves a notarlo, simplemente responde a este correo." Sin em-dashes, sin firmas exageradas. El sistema agrega la firma automática y la nota de "responde para reabrir" al final.
4. Cuando ya no queden acciones útiles, termina el turno (end_turn) sin llamar más tools.

REGLAS DE ORO:
- Solo maneja lo administrativo. NO respondas por otros empleados en llamadas o correos de sus clientes.
- Sé conciso en los prompts a Claude Code: contexto, evidencia, reproducción, hipótesis. Todo lo que sirva para arreglar en un solo PR.
- No escales al owner por cosas menores. Reserva escalar_al_owner para riesgo real o repetición sostenida.
- Nunca uses una tool que no esté declarada aquí.
- Si revisar_incidentes_plataforma devuelve total_new_signals=0 Y pending_verification_count=0, termina el turno de inmediato (no hay trabajo).
- Si hay pending_verification, SIEMPRE recórrelos primero (aunque total_new_signals=0). Es tu cola de trabajo pendiente.

REGLAS DE COPY (críticas para toda comunicación que generes):
- NUNCA uses em-dashes ("—" o "–"). Sustituye con dos puntos (:), coma (,) o punto (.). Esto aplica a titles, descripciones, prompts a Claude Code, mensajes a clientes y al owner. Absoluto.
- NUNCA uses la palabra "meerkat" en copy visible al cliente o al owner. Usa "empleado" o "empleado de Centinelia". Interno se llama "Centinelia interno".
- Firmas de correo/mensajes al cliente: "Nash, Centinelia interno" (sin em-dash prefijo).`;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface NashRunResult {
  ok:                  boolean;
  skipped_reason?:     string;
  iterations?:         number;
  tool_calls?:         Array<{ turn: number; name: string; ok: boolean; error?: string }>;
  stopped_because?:    'end_turn' | 'no_tool_use' | 'max_iterations' | 'error';
  total_input_tokens?: number;
  total_output_tokens?: number;
  latency_ms?:         number;
}

export async function runNashMonitor(): Promise<NashRunResult> {
  const started  = Date.now();
  const supabase = createAdminClient();

  // 1) Fetch Nash agent
  const { data: nash, error: fetchErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, portal_token, features, active')
    .eq('portal_email', NASH_PORTAL)
    .contains('features', { meerkat_role_id: 'nash' })
    .eq('active', true)
    .maybeSingle();

  if (fetchErr) return { ok: false, skipped_reason: `fetch error: ${fetchErr.message}` };
  if (!nash)    return { ok: false, skipped_reason: `Nash agent not found (portal ${NASH_PORTAL})` };

  const features = (nash.features as Record<string, unknown> | null) ?? {};
  if (features.nash_cron_enabled !== true) {
    return { ok: true, skipped_reason: 'nash_cron_enabled=false (opt-in requerido)' };
  }

  // 2) LLM loop
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system = buildSystemPrompt(nash as { agent_name: string | null });
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Corre tu ciclo de monitoreo ahora.' },
  ];

  const ctx: AgentToolContext = {
    agentId:      nash.id as string,
    portalEmail:  nash.portal_email as string,
    agentName:    (nash.agent_name as string | null) ?? 'Nash',
    businessName: (nash.business_name as string | null) ?? 'Centinelia',
    portalToken:  (nash.portal_token as string | null) ?? '',
    agent:        nash as unknown as Record<string, unknown>,
    supabase,
    channel:      'chat',
  };

  const toolCalls: NashRunResult['tool_calls'] = [];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let stopped: NashRunResult['stopped_because'] = 'max_iterations';
  let iteration = 0;

  for (iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const t0 = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools:      NASH_TOOLS,
        messages,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logLlmCall({
        source:      'nash-monitor',
        model:       MODEL,
        usage:       { input_tokens: 0, output_tokens: 0 },
        agentId:     nash.id as string,
        portalEmail: nash.portal_email as string,
        latencyMs:   Date.now() - t0,
        error:       msg,
        meta:        { iteration },
      });
      stopped = 'error';
      return { ok: false, iterations: iteration, tool_calls: toolCalls, stopped_because: stopped, skipped_reason: msg, latency_ms: Date.now() - started };
    }

    totalInputTokens  += resp.usage.input_tokens  ?? 0;
    totalOutputTokens += resp.usage.output_tokens ?? 0;

    await logLlmCall({
      source:      'nash-monitor',
      model:       MODEL,
      usage:       resp.usage,
      agentId:     nash.id as string,
      portalEmail: nash.portal_email as string,
      latencyMs:   Date.now() - t0,
      meta:        { iteration, stop_reason: resp.stop_reason },
    });

    if (resp.stop_reason === 'end_turn') {
      stopped = 'end_turn';
      break;
    }

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) {
      stopped = 'no_tool_use';
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      try {
        const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, ctx);
        const okFlag = !(result && typeof result === 'object' && (result as { ok?: unknown }).ok === false);
        toolCalls.push({ turn: iteration, name: tu.name, ok: okFlag, error: okFlag ? undefined : String((result as { error?: unknown }).error ?? 'unknown') });
        toolResults.push({
          type:         'tool_result',
          tool_use_id:  tu.id,
          content:      JSON.stringify(result).slice(0, 20_000),
          is_error:     !okFlag,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolCalls.push({ turn: iteration, name: tu.name, ok: false, error: msg });
        toolResults.push({
          type:         'tool_result',
          tool_use_id:  tu.id,
          content:      JSON.stringify({ ok: false, error: msg }),
          is_error:     true,
        });
      }
    }

    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user',      content: toolResults });
  }

  return {
    ok:                  true,
    iterations:          Math.min(iteration, MAX_ITERATIONS),
    tool_calls:          toolCalls,
    stopped_because:     stopped,
    total_input_tokens:  totalInputTokens,
    total_output_tokens: totalOutputTokens,
    latency_ms:          Date.now() - started,
  };
}
