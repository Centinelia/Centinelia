/**
 * Helper compartido para respuestas de server tools de Vapi.
 *
 * En Vapi custom-llm mode (model.provider='custom-llm'), Vapi ejecuta la tool
 * contra el server URL y espera que el server devuelva la respuesta en formato:
 *
 *   { "results": [ { "toolCallId": "call_xxx", "result": "<string>" } ] }
 *
 * Sin ese wrap, Vapi le pasa al modelo "No result returned. If this is unexpected"
 * como content del tool_result, aunque el server haya respondido 200 OK con datos.
 *
 * Descubierto 2026-09-26 en demo Municipio Santiago NL: Nia con Sonnet 4.6 +
 * custom-llm no reconocía al llamante recurrente aunque buscar_cliente ejecutaba
 * exitoso. El bug tapaba a otros dos bugs previos del pipeline: `arguments=""` en
 * el SSE translator y IDs formato `toolu_` vs `call_`.
 *
 * En Haiku direct (path viejo sin cache), Vapi manejaba tools internamente y el
 * response flat `{result, found, ...}` funcionaba. Con custom-llm hay que envolver.
 *
 * Fallback: si el body no trae toolCallId (paths legacy o llamadas de test),
 * devolvemos el objeto flat para no romper backwards-compat.
 *
 * Uso en un endpoint de tool:
 *   const body = await req.json();
 *   const { toolCallId, args } = extractToolCall(body);
 *   ...logic...
 *   return toolResponse(toolCallId, 'Texto que el modelo verá', { extra: 'flat-only fields' });
 */

import { NextResponse } from 'next/server';

export interface ToolCallExtracted {
  /** ID que Vapi asigna al tool_call. Vacío si el body no lo trae (legacy). */
  toolCallId: string;
  /** Arguments parseados del tool_call. `{}` si no vienen o el JSON falla. */
  args:       Record<string, unknown>;
  /** ID de la llamada de voz, si viene. Útil para trace. */
  sessionId:  string | null;
  /** Número del ciudadano en línea (E.164), si viene. */
  callerNumber: string;
}

/**
 * Extrae toolCallId, args parseados, sessionId y callerNumber del body que Vapi
 * manda al server tool. Robusto a varios paths históricos.
 */
export function extractToolCall(body: unknown): ToolCallExtracted {
  const b = (body ?? {}) as Record<string, unknown>;
  const msg = (b.message ?? {}) as Record<string, unknown>;
  const toolList = ((msg.toolCallList ?? b.toolCallList) as Array<Record<string, unknown>> | undefined) ?? [];
  const first = toolList[0] ?? null;
  const toolCallId = typeof first?.id === 'string' ? first.id : '';

  const rawArgs: unknown = (first?.function as { arguments?: unknown } | undefined)?.arguments ?? b;
  let args: Record<string, unknown> = {};
  if (typeof rawArgs === 'string') {
    try { args = JSON.parse(rawArgs || '{}') as Record<string, unknown>; } catch { args = {}; }
  } else if (rawArgs && typeof rawArgs === 'object') {
    args = rawArgs as Record<string, unknown>;
  }

  const call = (msg.call ?? {}) as Record<string, unknown>;
  const customer = (call.customer ?? msg.customer ?? {}) as Record<string, unknown>;
  const callerNumber = typeof customer.number === 'string' ? customer.number : '';
  const sessionId = typeof call.id === 'string' ? call.id : null;

  return { toolCallId, args, sessionId, callerNumber };
}

/**
 * Envuelve la respuesta de un server tool en el formato que Vapi custom-llm mode
 * espera. Fallback al formato flat legacy si no viene toolCallId (tests, curl
 * directo, o rutas viejas).
 *
 * @param toolCallId  El ID extraído por extractToolCall. String vacío significa fallback.
 * @param result      El texto que el modelo verá como resultado del tool_result.
 * @param extra       Campos adicionales del objeto flat (found, nombre, etc). Solo se
 *                    incluyen si toolCallId está vacío (fallback path).
 */
export function toolResponse(
  toolCallId: string,
  result: string,
  extra?: Record<string, unknown>,
): NextResponse {
  if (toolCallId) {
    return NextResponse.json({ results: [{ toolCallId, result }] });
  }
  return NextResponse.json({ result, ...(extra ?? {}) });
}
