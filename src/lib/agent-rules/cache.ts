/**
 * Cache en memoria de reglas por (portalEmail, meerkatRoleId).
 * TTL 5 min con invalidación explícita al mutar en el service.
 *
 * Diseño deliberadamente simple:
 * - Map en proceso: se pierde al reiniciar. Para invalidación cross-process en
 *   Vercel Edge Functions se usaría pg_notify (futura mejora, ver spec 5.2).
 * - La llave es "{portalEmail}:{meerkatRoleId}" para agrupar por portal.
 * - invalidateRulesCache(portalEmail) borra TODAS las entries del portal dado.
 */

import { getRulesForAgent, type AgentRule } from './service';

const TTL_MS = 5 * 60 * 1000; // 5 minutos

const cache = new Map<string, { rules: AgentRule[]; expiresAt: number }>();

function cacheKey(portalEmail: string, meerkatRoleId: string): string {
  return `${portalEmail}:${meerkatRoleId}`;
}

/**
 * Retorna las reglas aplicables a un meerkat concreto, usando cache.
 * El miss llama a getRulesForAgent (RPC en Supabase).
 */
export async function getCachedRulesForAgent(
  portalEmail: string,
  meerkatRoleId: string,
): Promise<AgentRule[]> {
  const k = cacheKey(portalEmail, meerkatRoleId);
  const cached = cache.get(k);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules;
  }
  const rules = await getRulesForAgent(portalEmail, meerkatRoleId);
  cache.set(k, { rules, expiresAt: Date.now() + TTL_MS });
  return rules;
}

/**
 * Invalida el cache para un portal específico (todas sus keys) o todo el cache.
 *
 * @param portalEmail - Si se provee, solo se borran las keys de ese portal.
 *   Si se omite, se limpia todo el cache (útil en tests).
 */
export async function invalidateRulesCache(portalEmail?: string): Promise<void> {
  if (!portalEmail) {
    cache.clear();
    return;
  }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${portalEmail}:`)) {
      cache.delete(k);
    }
  }
}
