import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FlagRow, EvaluatorReason } from './types';

// Cache in-memory con TTL 60s. Alineado con resolve-meerkat.ts.
// Prod tiene ~100 orgs, ~50 flags = trivial.
let cache: { rows: Map<string, FlagRow>; loadedAt: number } | null = null;
const TTL_MS = 60_000;

async function loadAll(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rows;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('feature_flags').select('*');
  if (error) {
    console.error('[feature-flags] load error', { error: error.message });
    // Devolver cache vieja si existe (mejor stale que 500). Sino, mapa vacío.
    return cache?.rows ?? new Map();
  }
  const rows = new Map((data ?? []).map(r => [r.flag_key, r as FlagRow]));
  cache = { rows, loadedAt: Date.now() };
  return rows;
}

export function invalidateFlagCache(): void {
  cache = null;
}

export function hashBucket(orgEmail: string, flagKey: string): number {
  const h = createHash('sha256').update(`${orgEmail}::${flagKey}`).digest();
  const n = h.readUInt32BE(0);
  return n % 100;
}

export async function isFeatureEnabled(
  flagKey: string,
  orgEmail: string | null | undefined,
): Promise<boolean> {
  const result = await evaluate(flagKey, orgEmail);
  return result.on;
}

// Version detallada para preview/dry-run y debugging.
export async function evaluate(
  flagKey: string,
  orgEmail: string | null | undefined,
): Promise<{ on: boolean; reason: EvaluatorReason }> {
  const rows = await loadAll();
  const flag = rows.get(flagKey);

  if (!flag) return { on: false, reason: 'unknown_off' };
  if (flag.killed) return { on: false, reason: 'killed' };
  if (!orgEmail) return { on: flag.default_on, reason: 'default_on' };
  if (flag.denylist.includes(orgEmail)) return { on: false, reason: 'denylist' };
  if (flag.allowlist.includes(orgEmail)) return { on: true, reason: 'allowlist' };

  const bucket = hashBucket(orgEmail, flagKey);
  const on = bucket < flag.rollout_pct;
  return { on, reason: on ? 'hash_on' : 'hash_off' };
}

export async function getAllFlagKeys(): Promise<string[]> {
  const rows = await loadAll();
  return Array.from(rows.keys());
}
