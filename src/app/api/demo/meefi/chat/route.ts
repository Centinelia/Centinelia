/**
 * POST /api/demo/meefi/chat
 *
 * Endpoint publico para la demo Meefi 15-sept. Expone a Nelia (soporte Meefi)
 * como chatbot embebible sin requerir sesion autenticada.
 *
 * Diferencias con /api/portal/[token]/agent-chat:
 * - Sin auth de portal (endpoint publico, rate-limited por IP).
 * - Sin consumo de ops-pool (demo gratuita, costo absorbe Centinelia).
 * - Tools limitadas: solo las 7 herramientas meefi_ de la demo.
 * - system_context_extra inyectado directamente en el system prompt (Option B).
 *
 * Variables de entorno requeridas:
 *   MEEFI_NELIA_AGENT_ID  — UUID del voice_agent de Nelia en org Meefi.
 *   ANTHROPIC_API_KEY     — ya existente en el proyecto.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { getMeefiUser } from '@/lib/tools/fixtures/meefi-users';
import { MEEFI_TOOL_DEFINITIONS } from '@/lib/tools/definitions/meefi-demo';
import { executeAgentTool } from '@/lib/tools/executor';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// ── Tool schema conversion ─────────────────────────────────────────────────────
// Convierte MeefiToolDef (JSON Schema plano) al shape que espera Anthropic SDK.

const NELIA_TOOLS: Anthropic.Tool[] = MEEFI_TOOL_DEFINITIONS.map(def => ({
  name: def.name,
  description: def.description,
  input_schema: def.parameters as Anthropic.Tool['input_schema'],
}));

// ── System prompt base de Nelia ────────────────────────────────────────────────

const NELIA_BASE_SYSTEM = `Eres Nelia, especialista de soporte al cliente de Meefi — una fintech mexicana de pagos digitales.

Tu rol es resolver problemas de cuentas, transferencias, acceso y bugs de la plataforma. Eres directa, empática y resolutiva. Siempre buscas resolver en la misma conversacion sin escalar innecesariamente.

## Personalidad

Eres accesible pero profesional. Hablas en segunda persona singular ("tu cuenta", "te puedo ayudar"). Usas lenguaje natural, sin jerga tecnica innecesaria. Cuando hay buenas noticias las das con claridad; cuando hay malas noticias las das directamente con la solucion inmediata.

## Flujo de trabajo

1. Cuando el usuario menciona un problema relacionado con su cuenta, primero invoca meefi_lookup_user_account con su correo para tener contexto real.
2. Con los datos de la cuenta, decide que herramienta usar: reset de contrasena, recuperacion de 2FA, estado de transferencia, reporte de bug o escalamiento.
3. Si el problema requiere atencion humana, usa meefi_escalate_to_human con un resumen ejecutivo claro.
4. Para CUALQUIER pregunta informativa sobre tiempos, comisiones, limites, procesos o politicas de Meefi, invoca meefi_search_help_center PRIMERO y responde citando el articulo con snippet + link. NO respondas de memoria en temas informativos.

## Restricciones

- No inventes datos de cuentas ni saldos.
- No prometas tiempos de resolucion especificos para escalamientos.
- No compartas informacion sensible de otros usuarios.
- Si el usuario no proporciona su correo y lo necesitas para operar, pidelo directamente.

## Herramientas disponibles

${NELIA_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Invoca las herramientas cuando las necesites. No narres lo que vas a hacer sin invocarlas.

Responde en espanol mexicano. Se concisa: 2-4 oraciones salvo que el detalle lo requiera. Sin em-dashes.

## Formato de tus respuestas

NO uses sintaxis Markdown. El chat renderiza texto plano, cualquier caracter especial se ve literal. Sigue estas reglas siempre:

- No uses ** para negrita. No uses * para italica. No uses # para titulos. No uses \` para codigo inline.
- Cuando quieras resaltar algo, usa MAYUSCULAS moderadas o simplemente pon la idea en su propia frase.
- Cuando enumeres pasos usa "1." "2." "3." al inicio de linea, seguido de un espacio. NO agregues negritas al numero ni al texto.
- Para separar ideas usa lineas en blanco (dos saltos de linea seguidos).
- No uses viñetas con - ni con *. Si necesitas listar sin orden, usa punto y coma o frases independientes.
- No uses backticks. Los ticket IDs y correos los das como texto normal ("Ticket esc_9k2p8f4x queda con Emilio").`;

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit por IP — endpoint publico sin auth
  const limited = await rateLimit(req, limiters.chat);
  if (limited) return limited;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Servicio no disponible. Contacta a soporte.' },
      { status: 500 },
    );
  }

  const agentId = process.env.MEEFI_NELIA_AGENT_ID;
  if (!agentId) {
    return NextResponse.json(
      { error: 'MEEFI_NELIA_AGENT_ID no configurado en el entorno.' },
      { status: 500 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { message?: unknown; messages?: unknown; scenario?: unknown; user_email?: unknown; session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud invalido.' }, { status: 400 });
  }

  const { message, messages: rawMessages, scenario, user_email, session_id } = body;

  // Acepta tanto `message` (string, single-turn) como `messages` (array, multi-turn).
  let conversationMessages: Anthropic.MessageParam[];

  if (Array.isArray(rawMessages) && rawMessages.length > 0) {
    // Multi-turn: valida que cada elemento tenga role+content
    conversationMessages = (rawMessages as { role: string; content: string }[])
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .slice(-20); // max 20 mensajes de historial
  } else if (typeof message === 'string' && message.trim()) {
    conversationMessages = [{ role: 'user', content: message.trim() }];
  } else {
    return NextResponse.json({ error: 'Se requiere "message" (string) o "messages" (array).' }, { status: 400 });
  }

  if (!conversationMessages.length) {
    return NextResponse.json({ error: 'Mensaje vacio.' }, { status: 400 });
  }

  // ── Contexto de usuario (Option B: inyectar en system prompt) ───────────────
  let userContextBlock = '';
  if (typeof user_email === 'string' && user_email) {
    const user = getMeefiUser(user_email);
    if (user) {
      userContextBlock = `\n\n## Contexto de sesion\nEl usuario activo en esta conversacion es ${user.name} (correo: ${user.email}, user_id: ${user.user_id}, estado: ${user.status}). Cuando invoque herramientas que requieran user_id, usa "${user.user_id}" directamente sin pedirlo al usuario.`;
    }
  }

  const scenarioBlock = typeof scenario === 'number'
    ? `\n\n## Escenario de demo\nEsta es una conversacion del escenario ${scenario} de la demo de Meefi.`
    : '';

  // ── Cargar agent row para el executor context ────────────────────────────────
  // executeAgentTool necesita ctx.agent, ctx.supabase, etc.
  // Si falla la carga, seguimos con un ctx minimal (los meefi_ tools no necesitan
  // todos los campos del ctx).
  const supabase = createAdminClient();
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, features, role_knowledge_base')
    .eq('id', agentId)
    .maybeSingle();

  const toolCtx = {
    agentId,
    portalEmail:  (agentRow?.portal_email as string | null) ?? 'meefi-demo@centinelia.mx',
    agentName:    (agentRow?.agent_name  as string | null) ?? 'Nelia',
    businessName: (agentRow?.business_name as string | null) ?? 'Meefi',
    portalToken:  '',
    agent:        agentRow ?? { id: agentId },
    supabase,
    channel:      'chat' as const,
    sourceInboxId: typeof session_id === 'string' ? session_id : undefined,
  };

  // KB operativa Nelia cargada en voice_agents.role_knowledge_base (T10).
  // Se inyecta al system prompt como bloque adicional para que respete las
  // reglas de escalamiento, flujos y limites definidos por el equipo.
  const roleKbBlock = agentRow?.role_knowledge_base
    ? `\n\n## Guias operativas y reglas de escalamiento\n\n${agentRow.role_knowledge_base}`
    : '';

  const systemPrompt = NELIA_BASE_SYSTEM + userContextBlock + scenarioBlock + roleKbBlock;

  // ── Streaming SSE ────────────────────────────────────────────────────────────

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Post-filter: elimina em/en-dashes que el modelo emite pese a las instrucciones
  const stripEmDashes = (t: string): string => t.replace(/[‒–—―−⸺⸻]/g, ', ');
  // Post-filter: elimina sintaxis Markdown que el widget muestra literal.
  // - **negrita** → negrita
  // - *cursiva*  → cursiva (evita * pegados a letras)
  // - `codigo`   → codigo
  const stripMarkdown = (t: string): string => t
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
  const sanitize = (t: string): string => stripMarkdown(stripEmDashes(t));

  const readable = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder();
      const send = (text: string) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: sanitize(text) })}\n\n`));

      type AssistantBlock =
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

      const __model  = 'claude-sonnet-4-6';
      const runStart = Date.now();
      let   llmCalls = 0;

      try {
        let msgs: Anthropic.MessageParam[] = [...conversationMessages];

        const MAX_CALLS = 5;
        let callCount   = 0;
        // Flag para insertar separador visual entre bloques de texto.
        // Al inicio de cada wave post-tool, la respuesta llega pegada al texto
        // anterior ("Reviso tu caso.Carlos, el reset..."). Cuando se emita el
        // primer text_delta de una nueva wave, precedemos con "\n\n".
        let hasEmittedTextEver = false;
        let needsSeparatorBeforeNextText = false;

        while (callCount < MAX_CALLS) {
          callCount++;
          llmCalls = callCount;

          const __t = Date.now();

          const stream = client.messages.stream({
            model:      __model,
            max_tokens: 1024,
            system:     [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            tools:      callCount === 1
              ? NELIA_TOOLS.map((t, i) =>
                  i === NELIA_TOOLS.length - 1
                    ? { ...t, cache_control: { type: 'ephemeral' as const } }
                    : t,
                )
              : NELIA_TOOLS,
            messages: msgs,
          });

          stream.finalMessage().then(finalMsg => {
            void logLlmCall({
              source:      'demo_meefi_chat',
              model:       __model,
              usage:       finalMsg.usage,
              agentId,
              portalEmail: toolCtx.portalEmail,
              latencyMs:   Date.now() - __t,
              meta:        { callCount, session_id },
            });
          }).catch(err => {
            void logLlmCall({
              source:      'demo_meefi_chat',
              model:       __model,
              usage:       { input_tokens: 0, output_tokens: 0 },
              agentId,
              portalEmail: toolCtx.portalEmail,
              latencyMs:   Date.now() - __t,
              error:       err instanceof Error ? err.message : String(err),
              meta:        { callCount, session_id },
            });
          });

          // Bufferiza bloques del stream
          const assistantBlocks: AssistantBlock[] = [];
          let   blockIndex    = -1;
          let   inputJsonBuf  = '';

          for await (const chunk of stream) {
            if (chunk.type === 'content_block_start') {
              blockIndex++;
              if (chunk.content_block.type === 'text') {
                assistantBlocks[blockIndex] = { type: 'text', text: '' };
              } else if (chunk.content_block.type === 'tool_use') {
                assistantBlocks[blockIndex] = {
                  type:  'tool_use',
                  id:    chunk.content_block.id,
                  name:  chunk.content_block.name,
                  input: {},
                };
                inputJsonBuf = '';
              }
            } else if (chunk.type === 'content_block_delta') {
              if (chunk.delta.type === 'text_delta') {
                const blk = assistantBlocks[blockIndex];
                if (blk?.type === 'text') {
                  // Si venimos de una wave anterior con texto emitido y hubo
                  // tool_use en el medio, insertar salto de línea antes del
                  // primer chunk de texto de esta nueva wave.
                  if (needsSeparatorBeforeNextText && hasEmittedTextEver) {
                    send('\n\n');
                    needsSeparatorBeforeNextText = false;
                  }
                  hasEmittedTextEver = true;
                  blk.text += chunk.delta.text;
                  send(chunk.delta.text);
                }
              } else if (chunk.delta.type === 'input_json_delta') {
                inputJsonBuf += chunk.delta.partial_json;
              }
            } else if (chunk.type === 'content_block_stop') {
              const blk = assistantBlocks[blockIndex];
              if (blk?.type === 'tool_use' && inputJsonBuf) {
                try { blk.input = JSON.parse(inputJsonBuf); } catch { /* mantener vacio */ }
                inputJsonBuf = '';
              }
            }
          }

          // Obtener stop_reason del mensaje final
          const finalMsg   = await stream.finalMessage();
          const stopReason = finalMsg.stop_reason;

          if (stopReason !== 'tool_use') {
            // No hay tool calls — terminamos
            break;
          }

          // Hay tool calls — ejecutar y continuar el loop
          const toolUseBlocks = assistantBlocks.filter(b => b.type === 'tool_use') as {
            type: 'tool_use'; id: string; name: string; input: Record<string, unknown>
          }[];

          if (!toolUseBlocks.length) break;

          // Marca para que la próxima wave inserte "\n\n" antes de su primer
          // text_delta, si ya emitimos texto en waves anteriores. Evita
          // que "Reviso tu caso." quede pegado a "Carlos, el reset...".
          needsSeparatorBeforeNextText = true;

          // Agregar mensaje del asistente con todos sus bloques
          msgs = [
            ...msgs,
            {
              role:    'assistant',
              content: assistantBlocks.map(b =>
                b.type === 'text'
                  ? { type: 'text' as const, text: b.text }
                  : { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input },
              ),
            },
          ];

          // Ejecutar cada tool y construir tool_result
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const tool of toolUseBlocks) {
            let result: unknown;
            try {
              result = await executeAgentTool(tool.name, tool.input, toolCtx);
            } catch (err) {
              result = { ok: false, error: err instanceof Error ? err.message : String(err) };
            }

            toolResults.push({
              type:        'tool_result',
              tool_use_id: tool.id,
              content:     JSON.stringify(result),
            });
          }

          msgs = [
            ...msgs,
            { role: 'user', content: toolResults },
          ];
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        void logLlmCall({
          source:      'demo_meefi_chat',
          model:       __model,
          usage:       { input_tokens: 0, output_tokens: 0 },
          agentId,
          portalEmail: toolCtx.portalEmail,
          latencyMs:   Date.now() - runStart,
          meta:        { session_done: true, llmCalls, session_id },
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: 'Error al procesar tu solicitud. Intenta de nuevo.' })}\n\n`),
        );
        void logLlmCall({
          source:      'demo_meefi_chat',
          model:       __model,
          usage:       { input_tokens: 0, output_tokens: 0 },
          agentId,
          portalEmail: toolCtx.portalEmail,
          latencyMs:   Date.now() - runStart,
          error:       errMsg,
          meta:        { session_id },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
