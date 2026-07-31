import { createAdminClient } from '@/lib/supabase/admin';
import type { ObsFilters, MeerkatObservabilityRow, ObsWindow } from './types';

interface RawCall {
  meerkat_id:      string | null;
  meerkat_version: number | null;
  active_flags:    string[] | null;
  outcome:         string;
  ces_data:        { overall?: number } | null;
  cost_usd:        number | null;
  latency_ms_p50:  number | null;
  latency_ms_p95:  number | null;
}

function windowStart(w: ObsWindow): Date {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (w) {
    case '24h': return new Date(now - day);
    case '7d':  return new Date(now - 7 * day);
    case '30d': return new Date(now - 30 * day);
    case 'since_activation': return new Date(now - 30 * day); // MVP: como 30d hasta que tengamos anchor por flag
  }
}

const AUTONOMOUS_EXCLUDED = new Set(['transferred', 'escalated_whatsapp']);

function pct(n: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((n / total) * 1000) / 10;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function fetchObservabilityData(filters: ObsFilters): Promise<MeerkatObservabilityRow[]> {
  const supabase = createAdminClient();
  const since = windowStart(filters.window).toISOString();

  let query = supabase
    .from('voice_calls')
    .select('meerkat_id, meerkat_version, active_flags, outcome, ces_data, cost_usd, latency_ms_p50, latency_ms_p95')
    .gte('created_at', since);

  if (filters.meerkatIds && filters.meerkatIds.length > 0) {
    query = query.in('meerkat_id', filters.meerkatIds);
  }
  if (filters.flagKey) {
    query = query.contains('active_flags', [filters.flagKey]);
  }

  const { data, error } = await query.returns<RawCall[]>();
  if (error) throw new Error(`observability query failed: ${error.message}`);

  const rows = data ?? [];

  // Agrupar por (meerkat_id, meerkat_version)
  const groups = new Map<string, RawCall[]>();
  for (const r of rows) {
    const key = r.meerkat_id
      ? `${r.meerkat_id}::v${r.meerkat_version ?? '?'}`
      : 'unattributed::null';
    if (!filters.includeUnattributed && !r.meerkat_id) continue;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const result: MeerkatObservabilityRow[] = [];
  for (const [key, group] of groups) {
    const [midPart, verPart] = key.split('::');
    const isUnattr = midPart === 'unattributed';
    const autonomous = group.filter(r => !AUTONOMOUS_EXCLUDED.has(r.outcome)).length;
    const cesValues  = group.map(r => r.ces_data?.overall).filter((v): v is number => typeof v === 'number');
    const costValues = group.map(r => r.cost_usd).filter((v): v is number => typeof v === 'number');
    const lat50s     = group.map(r => r.latency_ms_p50).filter((v): v is number => typeof v === 'number');
    const lat95s     = group.map(r => r.latency_ms_p95).filter((v): v is number => typeof v === 'number');

    result.push({
      meerkat_id:      isUnattr ? 'unattributed' : midPart,
      meerkat_version: isUnattr ? null : Number(verPart.slice(1)),
      calls:           group.length,
      autonomia_pct:   pct(autonomous, group.length),
      ces_avg:         avg(cesValues),
      cost_avg:        avg(costValues),
      lat_p50:         percentile(lat50s, 0.5),
      lat_p95:         percentile(lat95s, 0.95),
    });
  }

  // Ordenar: primero por meerkat_id alfabético, luego version ASC, unattributed al final
  result.sort((a, b) => {
    if (a.meerkat_id === 'unattributed') return 1;
    if (b.meerkat_id === 'unattributed') return -1;
    if (a.meerkat_id !== b.meerkat_id) return a.meerkat_id.localeCompare(b.meerkat_id);
    return (a.meerkat_version ?? 0) - (b.meerkat_version ?? 0);
  });

  return result;
}
