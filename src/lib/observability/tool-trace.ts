/**
 * H1 — Trace unificado de tool calls.
 * Wrap alrededor de executeAgentTool + cualquier LLM tool loop.
 * Fire-and-forget: nunca bloquea la ejecución del tool.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export interface ToolTraceContext {
  agentId?:      string | null;
  portalEmail?:  string | null;
  channel:       'voice' | 'chat' | 'email' | 'cron' | 'delegate' | 'consult';
  sessionId?:    string | null;
  parentId?:     string | null;
  loopId?:       string | null;
  attempt?:      number;
}

export interface ToolTraceRecord extends ToolTraceContext {
  toolName:   string;
  input:      unknown;
  output:     unknown;
  ok:         boolean;
  error?:     string | null;
  latencyMs:  number;
  meta?:      Record<string, unknown>;
}

/** Persist a single tool call record. Never throws — logging must not affect user path. */
export async function logToolCall(rec: ToolTraceRecord): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('tool_call_log').insert({
      agent_id:     rec.agentId ?? null,
      portal_email: rec.portalEmail ?? null,
      channel:      rec.channel,
      session_id:   rec.sessionId ?? null,
      parent_id:    rec.parentId ?? null,
      loop_id:      rec.loopId ?? null,
      tool_name:    rec.toolName,
      input_json:   safeJson(rec.input),
      output_json:  safeJson(rec.output),
      ok:           rec.ok,
      error:        rec.error ?? null,
      latency_ms:   rec.latencyMs,
      attempt:      rec.attempt ?? 1,
      meta:         rec.meta ?? null,
    });
  } catch (err) {
    // Trace failure never blocks the caller.
    console.warn('[tool-trace] insert failed:', err);
  }
}

/** Wrap an async tool executor to auto-log every invocation. */
export async function traceToolCall<T>(
  toolName: string,
  input:    unknown,
  ctx:      ToolTraceContext,
  fn:       () => Promise<T>,
  metaFn?:  (result: T | undefined, err: unknown) => Record<string, unknown> | undefined,
): Promise<T> {
  const started = Date.now();
  let result:   T | undefined;
  let error:    unknown;
  try {
    result = await fn();
    return result;
  } catch (err) {
    error = err;
    throw err;
  } finally {
    const latencyMs = Date.now() - started;
    const ok        = !error && !isFailureResult(result);
    const errMsg    = error
      ? (error instanceof Error ? error.message : String(error))
      : (isFailureResult(result) ? String((result as { error?: unknown }).error ?? 'unknown') : null);
    // Fire-and-forget — no await.
    void logToolCall({
      ...ctx,
      toolName,
      input,
      output: result,
      ok,
      error: errMsg,
      latencyMs,
      meta: metaFn?.(result, error),
    });
  }
}

function safeJson(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  try {
    // Guard against giant blobs — cap at 32KB per side.
    const s = JSON.stringify(v);
    if (s.length <= 32_000) return v;
    return { _truncated: true, _size: s.length, preview: s.slice(0, 4000) };
  } catch {
    return { _unserializable: true, type: typeof v };
  }
}

function isFailureResult(r: unknown): boolean {
  if (!r || typeof r !== 'object') return false;
  const ok = (r as { ok?: unknown }).ok;
  return ok === false;
}

/** Cheap id generator for grouping goal-loop attempts across trace rows. */
export function newLoopId(): string {
  // Use crypto if available, else timestamp-based fallback.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `loop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
