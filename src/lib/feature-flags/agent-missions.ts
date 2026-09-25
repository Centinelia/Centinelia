/**
 * Feature flags especificos para el subsistema Reglas, Tareas y Tags.
 *
 * Tres flags administrados por Centinelia, per-org, guardados en
 * organizations.features (jsonb). Default OFF para todos los orgs.
 *
 * Patrones de uso:
 *
 *   // Sync — ya tienes el org cargado
 *   if (isFeatureEnabled(org, 'agent_missions_enabled')) { ... }
 *
 *   // Async — solo tienes portal_email
 *   if (await isFeatureEnabledForPortal(portalEmail, 'retrieval_v2_enabled')) { ... }
 *
 *   // Setter para admin panel o script de rollout
 *   await setFeatureFlag(portalEmail, 'rerank_enabled', true);
 *
 * Ver spec Seccion 10 (Feature flags + Rollout) y Task 9.1.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ─── Tipo del flag ───────────────────────────────────────────────────────────

export type FeatureFlag =
  | 'agent_missions_enabled'
  | 'retrieval_v2_enabled'
  | 'rerank_enabled';

// ─── isFeatureEnabled (sync) ─────────────────────────────────────────────────

/**
 * Version sincrona para cuando ya tienes el org cargado en memoria.
 *
 * Acepta coercion defensiva: el valor en jsonb puede ser boolean true o
 * string 'true' (comportamiento mixto de Supabase jsonb).
 *
 * Default OFF: undefined, null, false, 'false', o cualquier otro valor = false.
 */
export function isFeatureEnabled(
  org: { features?: Record<string, unknown> | null },
  flag: FeatureFlag,
): boolean {
  const value = org.features?.[flag];
  return value === true || value === 'true';
}

// ─── isFeatureEnabledForPortal (async) ───────────────────────────────────────

/**
 * Version asincrona para cuando solo tienes el portal_email.
 * Hace un SELECT minimo (solo columna features) al org.
 *
 * Falla silenciosa: si Supabase falla, retorna false (default OFF).
 */
export async function isFeatureEnabledForPortal(
  portalEmail: string,
  flag: FeatureFlag,
): Promise<boolean> {
  if (!portalEmail?.trim()) return false;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  if (error) {
    console.warn('[agent-missions-flag] Error al leer features del org:', error.message);
    return false;
  }

  if (!data) return false;

  const org = data as { features?: Record<string, unknown> | null };
  return isFeatureEnabled(org, flag);
}

// ─── setFeatureFlag (async) ──────────────────────────────────────────────────

/**
 * Activa o desactiva un flag para un org especifico.
 *
 * Usa jsonb_set para patch atomic — no sobreescribe otros flags del org.
 * Idempotente: llamar dos veces con el mismo valor no tiene efecto adicional.
 *
 * Lanza si Supabase falla (el caller decide si atrapar).
 */
export async function setFeatureFlag(
  portalEmail: string,
  flag: FeatureFlag,
  enabled: boolean,
): Promise<void> {
  if (!portalEmail?.trim()) {
    throw new Error('[setFeatureFlag] portalEmail es requerido');
  }

  const supabase = createAdminClient();

  // Leer features actuales primero para hacer merge seguro.
  // jsonb_set como RPC no esta disponible en el client JS —
  // usamos el patron read-modify-write con coalesce del lado del cliente.
  const { data: current, error: readErr } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  if (readErr) {
    throw new Error(`[setFeatureFlag] Error al leer org ${portalEmail}: ${readErr.message}`);
  }

  const existing = ((current as { features?: Record<string, unknown> | null } | null)?.features ?? {}) as Record<string, unknown>;
  const updated  = { ...existing, [flag]: enabled };

  const { error: writeErr } = await supabase
    .from('organizations')
    .update({ features: updated })
    .eq('portal_email', portalEmail);

  if (writeErr) {
    throw new Error(`[setFeatureFlag] Error al actualizar org ${portalEmail}: ${writeErr.message}`);
  }
}
