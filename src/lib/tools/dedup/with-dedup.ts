import { createAdminClient } from '@/lib/supabase/admin';
import { computeArgsHash } from './hash-args';
import { getDedupConfig, DEFAULT_WINDOW_MIN } from './dedup-config';

export type DedupContext = {
  agentId:     string;
  portalEmail: string;
  toolName:    string;
  args:        Record<string, unknown>;
  channel:     'voice' | 'chat' | 'email';
  toolCallId?: string;
};

/**
 * Lookup imperativo — para handlers con lógica inline compleja donde
 * el wrap functional (withDedup) requeriría refactor grande. Retorna
 * el resultado cached si hay hit dentro de ventana; null si miss o
 * fail-open. Complementa con dedupStore al final del handler.
 */
export async function dedupLookup<T>(ctx: DedupContext): Promise<T | null> {
  const config = getDedupConfig(ctx.toolName);
  if (config.disable) return null;

  const supabase = createAdminClient();

  let flagEnabled = false;
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('dedup_middleware_enabled')
      .eq('portal_email', ctx.portalEmail)
      .maybeSingle();
    flagEnabled = !!(org?.dedup_middleware_enabled);
  } catch (err) {
    console.error('[dedup] fail-open (flag lookup):', err);
    return null;
  }
  if (!flagEnabled) return null;

  let argsHash: string;
  try {
    argsHash = computeArgsHash(ctx.toolName, ctx.args, {
      identity_keys: config.identity_keys,
      detail_keys:   config.detail_keys,
    });
  } catch (err) {
    console.error('[dedup] fail-open (hash):', err);
    return null;
  }

  const nowIso = new Date().toISOString();
  try {
    const { data: hit, error } = await supabase
      .from('tool_call_dedup')
      .select('result_json')
      .eq('agent_id', ctx.agentId)
      .eq('tool_name', ctx.toolName)
      .eq('args_hash', argsHash)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (hit?.result_json !== undefined && hit?.result_json !== null) {
      console.log('[dedup] hit', {
        tool: ctx.toolName, agent: ctx.agentId, channel: ctx.channel,
        toolCallId: ctx.toolCallId,
      });
      return hit.result_json as T;
    }
  } catch (err) {
    console.error('[dedup] fail-open (select):', err);
  }
  return null;
}

/**
 * Store imperativo — guarda el resultado en la tabla dedup con la
 * misma ventana temporal + config que withDedup. No throws.
 */
export async function dedupStore<T>(ctx: DedupContext, result: T): Promise<void> {
  const config = getDedupConfig(ctx.toolName);
  if (config.disable) return;

  const supabase = createAdminClient();

  let flagEnabled = false;
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('dedup_middleware_enabled')
      .eq('portal_email', ctx.portalEmail)
      .maybeSingle();
    flagEnabled = !!(org?.dedup_middleware_enabled);
  } catch {
    return;
  }
  if (!flagEnabled) return;

  let argsHash: string;
  try {
    argsHash = computeArgsHash(ctx.toolName, ctx.args, {
      identity_keys: config.identity_keys,
      detail_keys:   config.detail_keys,
    });
  } catch {
    return;
  }

  const windowMin = config.window_min ?? DEFAULT_WINDOW_MIN;
  const expiresAt = new Date(Date.now() + windowMin * 60 * 1000).toISOString();
  try {
    const { error: insErr } = await supabase.from('tool_call_dedup').insert({
      agent_id:     ctx.agentId,
      tool_name:    ctx.toolName,
      args_hash:    argsHash,
      result_json:  result,
      channel:      ctx.channel,
      tool_call_id: ctx.toolCallId ?? null,
      expires_at:   expiresAt,
    });
    if (insErr) throw insErr;
  } catch (err) {
    console.error('[dedup] fail-open (insert):', err);
  }
}

export async function withDedup<T>(
  ctx: DedupContext,
  handler: () => Promise<T>,
): Promise<T> {
  const config = getDedupConfig(ctx.toolName);

  if (config.disable) return handler();

  const supabase = createAdminClient();

  let flagEnabled = false;
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('dedup_middleware_enabled')
      .eq('portal_email', ctx.portalEmail)
      .maybeSingle();
    flagEnabled = !!(org?.dedup_middleware_enabled);
  } catch (err) {
    console.error('[dedup] fail-open (flag lookup):', err);
    return handler();
  }
  if (!flagEnabled) return handler();

  let argsHash: string;
  try {
    argsHash = computeArgsHash(ctx.toolName, ctx.args, {
      identity_keys: config.identity_keys,
      detail_keys:   config.detail_keys,
    });
  } catch (err) {
    console.error('[dedup] fail-open (hash):', err);
    return handler();
  }

  const nowIso = new Date().toISOString();
  try {
    const { data: hit, error } = await supabase
      .from('tool_call_dedup')
      .select('result_json')
      .eq('agent_id', ctx.agentId)
      .eq('tool_name', ctx.toolName)
      .eq('args_hash', argsHash)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (hit?.result_json !== undefined && hit?.result_json !== null) {
      console.log('[dedup] hit', {
        tool: ctx.toolName, agent: ctx.agentId, channel: ctx.channel,
        toolCallId: ctx.toolCallId,
      });
      return hit.result_json as T;
    }
  } catch (err) {
    console.error('[dedup] fail-open (select):', err);
    return handler();
  }

  const result = await handler();

  const windowMin = config.window_min ?? DEFAULT_WINDOW_MIN;
  const expiresAt = new Date(Date.now() + windowMin * 60 * 1000).toISOString();
  try {
    const { error: insErr } = await supabase.from('tool_call_dedup').insert({
      agent_id:     ctx.agentId,
      tool_name:    ctx.toolName,
      args_hash:    argsHash,
      result_json:  result,
      channel:      ctx.channel,
      tool_call_id: ctx.toolCallId ?? null,
      expires_at:   expiresAt,
    });
    if (insErr) throw insErr;
  } catch (err) {
    console.error('[dedup] fail-open (insert):', err);
  }

  return result;
}
