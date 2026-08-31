/**
 * Gate para los triggers event-driven per-empleado.
 *
 * Fuente de verdad: `voice_agents.instant_processing_enabled` (default true).
 * Si false → el trigger de ese agente no dispara y el trabajo cae al cron
 * horario/programado. Antes vivía en `organizations` (afectaba a toda la
 * cuenta); ahora cada empleado decide su propio ritmo.
 *
 * Cache in-memory por 60s por agentId. El caller SIEMPRE debe pasar agentId
 * ahora; portalEmail queda como fallback deprecado para código que aún no
 * migra (comportamiento permisivo default=true si solo tenemos email).
 */
import { createAdminClient } from '@/lib/supabase/admin';

interface CacheEntry {
  enabled:  boolean;
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function isInstantProcessingEnabled(agentId: string | null | undefined): Promise<boolean> {
  if (!agentId) return true; // sin agentId no podemos gate, default permisivo

  const now    = Date.now();
  const cached = cache.get(agentId);
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) return cached.enabled;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('voice_agents')
      .select('instant_processing_enabled')
      .eq('id', agentId)
      .maybeSingle();

    const enabled = data?.instant_processing_enabled !== false; // default true si null
    cache.set(agentId, { enabled, cachedAt: now });
    return enabled;
  } catch (err) {
    console.warn('[instant-processing] gate lookup failed, defaulting to enabled:', err);
    return true;
  }
}

/** Solo para tests o cuando se acaba de cambiar el flag. */
export function clearInstantProcessingCache(agentId?: string): void {
  if (agentId) cache.delete(agentId);
  else cache.clear();
}
