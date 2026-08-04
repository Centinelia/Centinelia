/**
 * H3 — Aggregates sobre tool_call_log para el dashboard admin.
 * Se agrupa por (tool_name, channel, opcional agent_id).
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type ToolMetricWindow = '1h' | '24h' | '7d' | '30d';

export interface ToolMetricFilters {
  window:    ToolMetricWindow;
  agentId?:  string | null;
  channel?:  string | null;
  toolName?: string | null;
}

export interface ToolMetricRow {
  tool_name:     string;
  channel:       string;
  calls:         number;
  ok_rate:       number | null;   // 0..1
  latency_p50:   number | null;   // ms
  latency_p95:   number | null;   // ms
  err_count:     number;
  last_error:    string | null;
  last_at:       string;
}

interface RawRow {
  tool_name:  string;
  channel:    string;
  ok:         boolean;
  latency_ms: number;
  error:      string | null;
  created_at: string;
}

function sinceIso(w: ToolMetricWindow): string {
  const h = { '1h': 1, '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[w];
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export async function fetchToolMetrics(f: ToolMetricFilters): Promise<ToolMetricRow[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from('tool_call_log')
    .select('tool_name, channel, ok, latency_ms, error, created_at')
    .gte('created_at', sinceIso(f.window))
    .order('created_at', { ascending: false })
    .limit(50_000);

  if (f.agentId)  q = q.eq('agent_id',  f.agentId);
  if (f.channel)  q = q.eq('channel',   f.channel);
  if (f.toolName) q = q.eq('tool_name', f.toolName);

  const { data, error } = await q.returns<RawRow[]>();
  if (error) throw new Error(`tool metrics query failed: ${error.message}`);

  const groups = new Map<string, RawRow[]>();
  for (const r of data ?? []) {
    const k = `${r.tool_name}::${r.channel}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  const rows: ToolMetricRow[] = [];
  for (const [k, arr] of groups) {
    const [toolName, channel] = k.split('::');
    const oks   = arr.filter(r => r.ok).length;
    const errs  = arr.filter(r => !r.ok);
    const lats  = arr.map(r => r.latency_ms).filter(n => typeof n === 'number');
    rows.push({
      tool_name:   toolName,
      channel,
      calls:       arr.length,
      ok_rate:     arr.length ? oks / arr.length : null,
      latency_p50: percentile(lats, 0.5),
      latency_p95: percentile(lats, 0.95),
      err_count:   errs.length,
      last_error:  errs[0]?.error ?? null,
      last_at:     arr[0].created_at,
    });
  }

  rows.sort((a, b) => b.calls - a.calls);
  return rows;
}
