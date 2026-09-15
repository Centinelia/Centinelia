/**
 * Feature flag helpers para publicacion social (Navi / Navi Agencia).
 *
 * `organizations.features.social_publishing` tiene la forma:
 *   { enabled: boolean, agency_mode?: boolean }
 *
 * Default: ambas devuelven false cuando el campo no existe o es null/undefined.
 */
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Devuelve true cuando la org tiene social_publishing activado.
 * Acepta null/undefined sin lanzar.
 */
export function socialPublishingEnabled(features: unknown): boolean {
  if (!features || typeof features !== 'object') return false;
  const sp = (features as Record<string, unknown>).social_publishing;
  if (!sp || typeof sp !== 'object') return false;
  return (sp as Record<string, unknown>).enabled === true;
}

/**
 * Devuelve true cuando la org tiene agency_mode activo.
 * Requiere que enabled === true tambien (un agency_mode sin enabled no tiene
 * sentido y se trata como desactivado).
 */
export function agencyModeEnabled(features: unknown): boolean {
  if (!socialPublishingEnabled(features)) return false;
  const sp = (features as Record<string, unknown>).social_publishing as Record<string, unknown>;
  return sp.agency_mode === true;
}

/**
 * Lookup de features reales desde la base de datos para un portal_email dado.
 * Util en handlers de tool que necesitan verificar el feature gate en runtime.
 */
export async function requireSocialFeature(
  portalEmail: string,
): Promise<{ enabled: boolean; agencyMode: boolean }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .single();
  return {
    enabled:    socialPublishingEnabled(data?.features),
    agencyMode: agencyModeEnabled(data?.features),
  };
}
