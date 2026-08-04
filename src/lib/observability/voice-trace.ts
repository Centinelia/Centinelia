/**
 * H1 (voz) — Helper para envolver voice tool routes con trace.
 *
 * Las voice tools tienen rutas dedicadas (`/api/voice/tools/*`) que NO pasan
 * por executor.ts. Este helper deja instrumentar cada ruta con un solo call
 * al final del handler.
 *
 * Uso típico:
 *   const started = Date.now();
 *   ... handler logic, produce `resultObj` ...
 *   void traceVoiceCall({ toolName, agentId, sessionId, input, resultObj, started });
 *   return NextResponse.json(...);
 */
import { logToolCall } from './tool-trace';

export interface VoiceTraceArgs {
  toolName:   string;
  agentId:    string | null | undefined;
  portalEmail?: string | null;
  sessionId?: string | null;   // vapi call_id si disponible
  input:      unknown;
  result:     unknown;
  ok?:        boolean;         // opcional; deriva de result.ok si viene como {ok:boolean}
  error?:     string | null;
  startedAt:  number;
  meta?:      Record<string, unknown>;
}

export function traceVoiceCall(args: VoiceTraceArgs): void {
  const latencyMs = Date.now() - args.startedAt;
  const derivedOk = args.ok !== undefined
    ? args.ok
    : (args.result && typeof args.result === 'object'
        ? (args.result as { ok?: unknown }).ok !== false
        : true);

  void logToolCall({
    toolName:    args.toolName,
    agentId:     args.agentId ?? null,
    portalEmail: args.portalEmail ?? null,
    channel:     'voice',
    sessionId:   args.sessionId ?? null,
    input:       args.input,
    output:      args.result,
    ok:          derivedOk,
    error:       args.error ?? null,
    latencyMs,
    meta:        args.meta,
  });
}
