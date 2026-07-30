import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS, DEFAULT_MODEL_CONFIG, type MeerkatModelConfig } from './meerkat-configs';

export type { MeerkatModelConfig } from './meerkat-configs';

const CACHE_TTL_MS = 60_000; // 60s — MTTR floor documentado en spec
const cache = new Map<string, { version: number; expiresAt: number }>();

export function clearMeerkatVersionCache(): void {
  cache.clear();
}

async function fetchActiveVersion(meerkatId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkatId)
    .maybeSingle();

  if (error) {
    console.error('[resolve-meerkat] fetch error', { meerkatId, error: error.message });
    return 1; // Fallback silencioso — no romper llamadas
  }
  if (!data) {
    console.warn('[resolve-meerkat] no active version row', { meerkatId });
    return 1;
  }
  return data.active_version;
}

export async function getActiveVersion(meerkatId: string): Promise<number> {
  const now = Date.now();
  const hit = cache.get(meerkatId);
  if (hit && hit.expiresAt > now) return hit.version;

  const version = await fetchActiveVersion(meerkatId);
  cache.set(meerkatId, { version, expiresAt: now + CACHE_TTL_MS });
  return version;
}

export async function resolveMeerkatConfig(
  meerkatId: string,
  pinnedVersion: number | null,
): Promise<MeerkatModelConfig> {
  const versions = MEERKAT_CONFIGS[meerkatId];
  if (!versions) return DEFAULT_MODEL_CONFIG;

  // 1. Pin per-agent gana sobre active global
  if (pinnedVersion != null && versions[pinnedVersion]) return versions[pinnedVersion];
  if (pinnedVersion != null && !versions[pinnedVersion]) {
    console.warn('[resolve-meerkat] invalid pin, ignoring', { meerkatId, pinnedVersion });
  }

  // 2. Active version del meerkat (cached)
  const active = await getActiveVersion(meerkatId);
  if (versions[active]) return versions[active];

  // 3. Fallback: última versión conocida en el bundle
  const availableVersions = Object.keys(versions).map(Number);
  const latestKnown = Math.max(...availableVersions);
  console.warn('[resolve-meerkat] stale active_version, falling back', { meerkatId, active, latestKnown });
  return versions[latestKnown];
}
