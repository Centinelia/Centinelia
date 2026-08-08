/**
 * Gate compartido para los triggers event-driven de la organización.
 *
 * Fuente de verdad: organizations.instant_processing_enabled (default true).
 * Si false → el trigger no dispara, el trabajo cae al cron horario/programado.
 *
 * Cache in-memory por 60s por portalEmail para evitar hit repetido dentro
 * del mismo warm boot cuando llegan varios triggers en ráfaga.
 */
import { createAdminClient } from '@/lib/supabase/admin';

interface CacheEntry {
  enabled:  boolean;
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function isInstantProcessingEnabled(portalEmail: string | null | undefined): Promise<boolean> {
  if (!portalEmail) return true; // sin portalEmail no podemos gate, default permisivo

  const now    = Date.now();
  const cached = cache.get(portalEmail);
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) return cached.enabled;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('organizations')
      .select('instant_processing_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const enabled = data?.instant_processing_enabled !== false; // default true si null/no existe
    cache.set(portalEmail, { enabled, cachedAt: now });
    return enabled;
  } catch (err) {
    console.warn('[instant-processing] gate lookup failed, defaulting to enabled:', err);
    return true;
  }
}

/** Solo para tests o cuando se acaba de cambiar el flag. */
export function clearInstantProcessingCache(portalEmail?: string): void {
  if (portalEmail) cache.delete(portalEmail);
  else cache.clear();
}
