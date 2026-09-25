/**
 * Helpers para whitelist efectiva de tags por rol de meerkat.
 *
 * Whitelist efectiva = role_default_tag_whitelist(role) union org_role_tag_additions(portal_email, role).
 * Solo agrega, nunca quita.
 *
 * Ver docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Secciones 4.2-4.3.
 *
 * Convención Centinelia: FK a organizations por portal_email TEXT, no org_id UUID.
 * Ver supabase/migrations/20260923120000_fichas_informativas.sql:18.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// Cache TTL 5 min por (portal_email, role) para minimizar queries en runtime del meerkat.
const WHITELIST_TTL_MS = 5 * 60 * 1000;
const whitelistCache = new Map<string, { tags: string[]; expiresAt: number }>();

function cacheKey(portalEmail: string, role: string): string {
  return `${portalEmail}:${role}`;
}

/**
 * Retorna la whitelist efectiva de tags para un meerkat en un org concreto.
 * Resultado = role_default_tag_whitelist(role) union org_role_tag_additions(portal_email, role).
 */
export async function getEffectiveWhitelist(
  portalEmail: string,
  role: string,
): Promise<string[]> {
  const k = cacheKey(portalEmail, role);
  const cached = whitelistCache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.tags;

  const supabase = createAdminClient();
  const [defaultRes, additionsRes] = await Promise.all([
    supabase.from('role_default_tag_whitelist').select('tag_slug').eq('role', role),
    supabase
      .from('org_role_tag_additions')
      .select('tag_slug')
      .eq('portal_email', portalEmail)
      .eq('role', role),
  ]);

  if (defaultRes.error) throw defaultRes.error;
  if (additionsRes.error) throw additionsRes.error;

  const combined = new Set<string>([
    ...(defaultRes.data ?? []).map((r) => r.tag_slug),
    ...(additionsRes.data ?? []).map((r) => r.tag_slug),
  ]);
  const tags = Array.from(combined);
  whitelistCache.set(k, { tags, expiresAt: Date.now() + WHITELIST_TTL_MS });
  return tags;
}

/**
 * Agrega un tag a la whitelist de un rol para un org concreto.
 * Solo AGREGA (upsert idempotente), nunca quita el core del rol.
 */
export async function addTagToRoleForOrg(
  portalEmail: string,
  role: string,
  tagSlug: string,
  addedBy: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('org_role_tag_additions')
    .upsert({ portal_email: portalEmail, role, tag_slug: tagSlug, added_by: addedBy });
  if (error) throw error;
  invalidateWhitelistCache(portalEmail, role);
}

/**
 * Retorna la lista de roles distintos con whitelist configurada.
 * Útil para validar applies_to en agent_rules.
 */
export async function getAllRoles(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('role_default_tag_whitelist')
    .select('role');
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((r) => r.role)));
}

/**
 * Invalida el cache de whitelist para un par (portalEmail, role).
 * Sin argumentos, invalida todo el cache.
 */
export function invalidateWhitelistCache(portalEmail?: string, role?: string): void {
  if (!portalEmail || !role) {
    whitelistCache.clear();
    return;
  }
  whitelistCache.delete(cacheKey(portalEmail, role));
}
