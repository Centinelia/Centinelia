/**
 * Helper compartido para parsear requests de tools de Vapi.
 *
 * Vapi actualmente envia el body en 2 formatos segun version/config:
 *   Formato nuevo: { message: { toolCallList: [...] } }
 *   Formato viejo: { toolCallList: [...] }
 *
 * Ademas, arguments puede venir como string JSON en algunas versiones.
 *
 * Si el toolCallId extraido no matchea con el que Vapi mando, Vapi
 * reporta "No result returned for <id>" y el modelo asume que la tool
 * fallo. Por eso es critico extraer bien del path correcto.
 */
export interface ParsedToolRequest<A = Record<string, unknown>> {
  args: A;
  toolCallId: string;
}

export function parseVapiToolRequest<A = Record<string, unknown>>(
  body: unknown,
): ParsedToolRequest<A> {
  const b = (body ?? {}) as Record<string, unknown>;
  const msg = (b.message as Record<string, unknown>) ?? b;
  const list = (msg.toolCallList as Record<string, unknown>[])
    ?? (b.toolCallList as Record<string, unknown>[]);
  const call = list?.[0];

  const rawArgs = (call?.function as Record<string, unknown>)?.arguments ?? body;
  const args = (typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs) as A;
  const toolCallId = (call?.id as string) ?? 'call_1';

  return { args, toolCallId };
}

/**
 * Envuelve una respuesta en el formato que Vapi espera actualmente:
 *   { results: [{ toolCallId, result, ...extra }] }
 *
 * El formato viejo { result: "..." } es ignorado por Vapi (reporta "No
 * result returned") aunque el HTTP responda 200.
 */
export function toolResult(
  toolCallId: string,
  result: string,
  extra?: Record<string, unknown>,
): { results: Array<{ toolCallId: string; result: string; [k: string]: unknown }> } {
  return { results: [{ toolCallId, result, ...(extra ?? {}) }] };
}
