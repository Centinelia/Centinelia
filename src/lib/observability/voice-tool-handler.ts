/**
 * Wrapper para envolver POST handlers de voice tools con:
 *   - Vapi auth check
 *   - Parseo estándar del body (Vapi toolCallList format)
 *   - traceVoiceCall automático con input/output/latency/error
 *
 * Uso:
 *   export const POST = withVoiceTool('crear_lead', async ({ agentId, args, req }) => {
 *     // lógica del handler; devuelve un objeto que será serializado a
 *     // { results: [{ toolCallId, result: <mensaje o string del objeto> }] }
 *     return { message: 'Lead creado', lead_id: '...' };
 *   });
 *
 * El helper acepta que el handler devuelva:
 *   - string     → se envía tal cual como result al modelo
 *   - { message, ... } → message va al modelo, el resto queda en trace
 *   - { error, ... }   → error va al modelo con ok=false
 *   - NextResponse directo si el handler quiere control total (raro)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireVapiAuth } from '@/lib/vapi/auth';
import { traceVoiceCall } from './voice-trace';

export interface VoiceToolCtx {
  agentId:    string;
  args:       Record<string, unknown>;
  toolCallId: string;
  sessionId:  string | null;
  req:        NextRequest;
  rawBody:    Record<string, unknown>;
}

export type VoiceToolHandler = (ctx: VoiceToolCtx) => Promise<string | Record<string, unknown> | NextResponse>;

function extractSessionId(body: Record<string, unknown>): string | null {
  const msg  = body.message as Record<string, unknown> | undefined;
  const call = msg?.call as Record<string, unknown> | undefined;
  return (call?.id as string) ?? null;
}

function extractCall(body: Record<string, unknown>) {
  const msg  = body.message as Record<string, unknown> | undefined;
  const list = (msg?.toolCallList ?? body.toolCallList) as Record<string, unknown>[] | undefined;
  return list?.[0];
}

function extractArgs(call: Record<string, unknown> | undefined, body: Record<string, unknown>): Record<string, unknown> {
  const raw = (call?.function as Record<string, unknown>)?.arguments ?? body;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw as Record<string, unknown>;
}

export function withVoiceTool(toolName: string, handler: VoiceToolHandler) {
  return async function POST(req: NextRequest): Promise<NextResponse> {
    if (!requireVapiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const agentId = req.nextUrl.searchParams.get('agent_id') ?? '';
    if (!agentId) return NextResponse.json({ error: 'agent_id requerido' }, { status: 400 });

    const startedAt = Date.now();
    let rawBody: Record<string, unknown> = {};
    try { rawBody = await req.json(); } catch { /* accept empty */ }

    const call       = extractCall(rawBody);
    const args       = extractArgs(call, rawBody);
    const toolCallId = (call?.id as string) ?? 'call_1';
    const sessionId  = extractSessionId(rawBody);

    let handlerResult: unknown;
    let handlerError: unknown;

    try {
      const out = await handler({ agentId, args, toolCallId, sessionId, req, rawBody });
      // Handler devolvió NextResponse — respeta y solo trace el body si es JSON.
      if (out instanceof NextResponse) {
        traceVoiceCall({ toolName, agentId, sessionId, input: args, result: { raw_response: true }, startedAt });
        return out;
      }
      handlerResult = out;
    } catch (err) {
      handlerError = err;
    }

    const ok = !handlerError && !(handlerResult && typeof handlerResult === 'object' && (handlerResult as { error?: unknown }).error);
    const errMsg = handlerError
      ? (handlerError instanceof Error ? handlerError.message : String(handlerError))
      : (handlerResult && typeof handlerResult === 'object' ? ((handlerResult as { error?: unknown }).error as string | undefined) ?? null : null);

    // Mensaje que llega al LLM de Vapi
    let resultMsg: string;
    if (handlerError) {
      resultMsg = 'Error interno al ejecutar la acción.';
    } else if (typeof handlerResult === 'string') {
      resultMsg = handlerResult;
    } else if (handlerResult && typeof handlerResult === 'object') {
      const obj = handlerResult as { message?: string; error?: string };
      resultMsg = obj.message ?? obj.error ?? 'Acción ejecutada.';
    } else {
      resultMsg = 'Acción ejecutada.';
    }

    traceVoiceCall({
      toolName,
      agentId,
      sessionId,
      input:  args,
      result: handlerResult ?? { error: errMsg },
      ok,
      error:  errMsg ?? undefined,
      startedAt,
    });

    return NextResponse.json({ results: [{ toolCallId, result: resultMsg }] });
  };
}
