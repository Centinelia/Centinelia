/**
 * Extrae contexto Vapi (assistantId, callId) del body + headers de un POST
 * al customLLM endpoint, y produce un snapshot diagnóstico del shape real.
 *
 * Historia: el fix de 2026-09-28 asumió `body.call.assistantId` y nunca
 * disparó en producción (1,886 calls en 30 días con agent_id=null). Esta
 * función se escribe para descubrir el shape real sin volver a adivinar.
 *
 * Mientras `resolved_assistant_id` siga null, revisar `vapi_diag.body_sample`
 * y `vapi_headers` para ver DÓNDE está el assistantId. Una vez identificado,
 * actualizar `extractAssistantId` y `extractCallId` y remover el diag.
 */

export interface VapiDiagSnapshot {
  body_keys:              string[];
  has_call:               boolean;
  has_message:            boolean;
  has_metadata:           boolean;
  has_phoneNumber:        boolean;
  has_customer:           boolean;
  body_sample:            string;
  vapi_headers:           Record<string, string>;
  resolved_assistant_id:  string | null;
  resolved_call_id:       string | null;
}

export interface VapiContext {
  vapiAssistantId: string | null;
  vapiCallId:      string | null;
  vapiDiag:        VapiDiagSnapshot;
}

function pickString(obj: Record<string, unknown> | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Busca `assistantId` en los lugares conocidos del payload Vapi:
 *   - body.call.assistantId       (customLLM clásico — documentado pero no observado)
 *   - body.message.assistantId    (webhook format, no customLLM — por si Vapi unifica)
 *   - body.message.call.assistantId (webhook anidado)
 *   - body.metadata.assistantId   (algunos setups con metadata personalizado)
 *   - header x-vapi-assistant-id  (fallback futuro)
 */
export function extractAssistantId(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): string | null {
  const call     = body.call     as Record<string, unknown> | undefined;
  const message  = body.message  as Record<string, unknown> | undefined;
  const metadata = body.metadata as Record<string, unknown> | undefined;
  const nested   = message?.call as Record<string, unknown> | undefined;

  return (
    pickString(call, 'assistantId')     ??
    pickString(message, 'assistantId')  ??
    pickString(nested, 'assistantId')   ??
    pickString(metadata, 'assistantId') ??
    headers['x-vapi-assistant-id']      ??
    null
  );
}

export function extractCallId(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): string | null {
  const call     = body.call     as Record<string, unknown> | undefined;
  const message  = body.message  as Record<string, unknown> | undefined;
  const metadata = body.metadata as Record<string, unknown> | undefined;
  const nested   = message?.call as Record<string, unknown> | undefined;

  return (
    pickString(call, 'id')         ??
    pickString(nested, 'id')       ??
    pickString(metadata, 'callId') ??
    headers['x-vapi-call-id']      ??
    null
  );
}

/**
 * Serializa el body redactando strings largos. El diag existe para encontrar
 * el shape del payload (dónde vive el assistantId), NO para auditar contenido.
 * Preserva IDs, flags y metadata cortos; redacta conversaciones y system
 * prompts para no filtrar PII (mensajes de clientes) a llm_call_log.meta.
 */
const REDACT_STRING_THRESHOLD = 60;
function safeStringify(body: Record<string, unknown>, maxLen: number): string {
  function sanitize(val: unknown): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') {
      return val.length > REDACT_STRING_THRESHOLD ? `<redacted ${val.length}c>` : val;
    }
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map(sanitize);
    return Object.fromEntries(
      Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]),
    );
  }
  return JSON.stringify(sanitize(body)).slice(0, maxLen);
}

export function extractVapiContext(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): VapiContext {
  const vapiHeaders = Object.fromEntries(
    Object.entries(headers).filter(([k]) => k.toLowerCase().startsWith('x-vapi')),
  );
  const vapiAssistantId = extractAssistantId(body, headers);
  const vapiCallId      = extractCallId(body, headers);

  return {
    vapiAssistantId,
    vapiCallId,
    vapiDiag: {
      body_keys:             Object.keys(body),
      has_call:              body.call       !== undefined,
      has_message:           body.message    !== undefined,
      has_metadata:          body.metadata   !== undefined,
      has_phoneNumber:       body.phoneNumber !== undefined,
      has_customer:          body.customer   !== undefined,
      body_sample:           safeStringify(body, 800),
      vapi_headers:          vapiHeaders,
      resolved_assistant_id: vapiAssistantId,
      resolved_call_id:      vapiCallId,
    },
  };
}
