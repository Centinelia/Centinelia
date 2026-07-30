/**
 * customLLM endpoint para Vapi (F1.1 iniciativa context engineering).
 *
 * Vapi manda POST /chat/completions con payload OpenAI-compat en cada turno
 * de voz. Nosotros:
 *   1. Transformamos a Anthropic format.
 *   2. Marcamos system prompt + tools con cache_control ephemeral.
 *   3. Llamamos anthropic.messages.stream().
 *   4. Traducimos el stream a SSE OpenAI-compat de vuelta a Vapi.
 *
 * El pay-off: el prompt de voz de ~900 líneas + tools de ~30 items queda
 * cacheado por 5 min. Cada turno subsecuente de la misma llamada paga 10%
 * del prefijo en vez de 100%. Turnos típicos de 6-12 por llamada = ahorro
 * 60-70% en input tokens de voz.
 *
 * Config en Vapi assistant:
 *   model.provider = 'custom-llm'
 *   model.url      = 'https://www.centinelia.mx/api/voice/llm'
 *   (Vapi appende '/chat/completions' automáticamente)
 *
 * Auth: Vapi inyecta el credentialId como header. Aceptamos Bearer con
 * VAPI_SERVER_SECRET o el header x-vapi-server-secret (mismo patrón que
 * el webhook de tools).
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { transformRequest, type OpenAIRequest } from '@/lib/voice/openai-to-anthropic';
import { anthropicToOpenAISse } from '@/lib/voice/anthropic-to-openai-sse';

export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';   // streaming SSE necesita nodejs (edge tiene TTFB issues con anthropic-ai/sdk)

const anthropic = new Anthropic();

function authorized(req: NextRequest): boolean {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (!secret) return false;   // fail-closed en prod si no configurado

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (bearer && bearer === secret) return true;

  const custom = req.headers.get('x-vapi-server-secret');
  if (custom && custom === secret) return true;

  // Fallback: secret en query string. Útil si Vapi no puede inyectar headers
  // en el URL de customLLM (algunos setups solo aceptan URL directa).
  //
  // Vapi bug 2026-07-30: cuando la URL base tiene query string, Vapi appende
  // '/chat/completions' AL VALOR del último parámetro en vez de al path. Así
  // llega como ?secret=<real_secret>/chat/completions. Aceptamos ambos.
  const qp = req.nextUrl.searchParams.get('secret');
  if (qp) {
    if (qp === secret) return true;
    if (qp === `${secret}/chat/completions`) return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return jsonError('Unauthorized', 401);
  }

  let body: OpenAIRequest & { call?: unknown; metadata?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (!body?.messages || !Array.isArray(body.messages)) {
    return jsonError('messages array required', 400);
  }

  // Vapi inyecta un objeto `call` con id/assistantId/phoneNumber — lo ignoramos
  // por ahora. Si quisiéramos correlacionar con voice_calls en logs, aquí es
  // donde lo haríamos.
  const model = body.model || 'claude-haiku-4-5-20251001';

  let params;
  try {
    params = transformRequest({ ...body, model });
  } catch (err) {
    console.error('[voice/llm] transformRequest error:', err);
    return jsonError(`Transform failed: ${err instanceof Error ? err.message : String(err)}`, 500);
  }

  const stream = anthropic.messages.stream({
    model:       params.model,
    max_tokens:  params.max_tokens,
    temperature: params.temperature,
    system:      params.system,
    messages:    params.messages,
    ...(params.tools     ? { tools:       params.tools       } : {}),
    ...(params.tool_choice ? { tool_choice: params.tool_choice } : {}),
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of anthropicToOpenAISse(stream, model)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error('[voice/llm] stream error:', err);
        // Emit error inline como SSE para que Vapi no cuelgue esperando [DONE]
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          error: { message: msg, type: 'stream_error' },
        })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
    },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { message, type: 'invalid_request' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
