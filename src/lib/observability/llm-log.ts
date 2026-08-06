import { createAdminClient } from '@/lib/supabase/admin';

// USD per million tokens (Anthropic pricing, actualizado 2026-08)
const PRICING: Record<string, { input: number; output: number; cacheCreation: number; cacheRead: number }> = {
  'claude-haiku-4-5':  { input: 1.0,  output: 5.0,  cacheCreation: 1.25,  cacheRead: 0.10 },
  'claude-sonnet-4-6': { input: 3.0,  output: 15.0, cacheCreation: 3.75,  cacheRead: 0.30 },
  'claude-opus-4-7':   { input: 15.0, output: 75.0, cacheCreation: 18.75, cacheRead: 1.50 },
};

function normalizeModel(model: string): string {
  // Normaliza 'claude-haiku-4-5-20251001' → 'claude-haiku-4-5' para lookup en PRICING
  if (model.startsWith('claude-haiku-4-5'))  return 'claude-haiku-4-5';
  if (model.startsWith('claude-sonnet-4-6')) return 'claude-sonnet-4-6';
  if (model.startsWith('claude-opus-4-7'))   return 'claude-opus-4-7';
  return model;
}

export interface AnthropicUsageLike {
  input_tokens:                  number;
  output_tokens:                 number;
  cache_creation_input_tokens?:  number | null;
  cache_read_input_tokens?:      number | null;
}

export function computeCostUsd(model: string, usage: AnthropicUsageLike): number {
  const p = PRICING[normalizeModel(model)];
  if (!p) return 0;
  const M = 1_000_000;
  return (
    (usage.input_tokens              / M) * p.input +
    (usage.output_tokens             / M) * p.output +
    ((usage.cache_creation_input_tokens ?? 0) / M) * p.cacheCreation +
    ((usage.cache_read_input_tokens     ?? 0) / M) * p.cacheRead
  );
}

export interface LogLlmCallOpts {
  source:       string;
  model:        string;
  usage:        AnthropicUsageLike;
  agentId?:     string | null;
  portalEmail?: string | null;
  latencyMs?:   number;
  error?:       string | null;
  meta?:        Record<string, unknown>;
}

/** Fire-and-forget. Never throws. */
export async function logLlmCall(opts: LogLlmCallOpts): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('llm_call_log').insert({
      source:                       opts.source,
      model:                        opts.model,
      input_tokens:                 opts.usage.input_tokens ?? 0,
      output_tokens:                opts.usage.output_tokens ?? 0,
      cache_creation_input_tokens:  opts.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:      opts.usage.cache_read_input_tokens ?? 0,
      cost_usd:                     computeCostUsd(opts.model, opts.usage),
      agent_id:                     opts.agentId    ?? null,
      portal_email:                 opts.portalEmail ?? null,
      latency_ms:                   opts.latencyMs  ?? null,
      error:                        opts.error      ?? null,
      meta:                         opts.meta       ?? null,
    });
  } catch (err) {
    console.warn('[llm-log] insert failed:', err);
  }
}
