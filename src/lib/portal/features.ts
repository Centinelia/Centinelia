import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Actualiza un sub-config dentro del JSONB `voice_agents.features` para TODOS
 * los meerkats del org (identificados por portal_email).
 *
 * Uso típico: configs compartidas del org que hoy viven en features JSONB
 * de voice_agents (factura_config, cotizacion_config, orden_config, etc).
 * Antes de este helper cada endpoint mutaba solo el primary y los peers se
 * quedaban con config vieja — bug de peer discrimination descubierto en el
 * audit 2026-08-18.
 *
 * Comportamiento:
 * - Si `portalEmail` existe: itera todos los agents del org y mergea
 *   `features[configKey]` en cada uno preservando el resto de features.
 * - Si `portalEmail` es null (demo standalone sin org): fallback a mutar
 *   solo el `agentIdFallback` por id.
 *
 * Migración futura: mover estos configs a columnas dedicadas en `organizations`
 * (una columna JSONB por dominio: `organizations.factura_config`, etc). Este
 * helper es puente hasta que eso ocurra.
 */
export async function updateOrgFeatureConfig(
  supabase:        SupabaseClient,
  portalEmail:     string | null,
  agentIdFallback: string,
  configKey:       string,
  configValue:     Record<string, unknown>,
): Promise<{ error?: string }> {
  if (!portalEmail) {
    const { data: agent, error: readErr } = await supabase
      .from('voice_agents').select('features').eq('id', agentIdFallback).single();
    if (readErr) return { error: readErr.message };
    const existing = (agent?.features as Record<string, unknown>) ?? {};
    const merged   = { ...existing, [configKey]: { ...(existing[configKey] as object ?? {}), ...configValue } };
    const { error } = await supabase.from('voice_agents').update({ features: merged }).eq('id', agentIdFallback);
    if (error) return { error: error.message };
    return {};
  }

  const { data: agents, error: readErr } = await supabase
    .from('voice_agents').select('id, features').eq('portal_email', portalEmail);
  if (readErr) return { error: readErr.message };
  if (!agents?.length) return {};

  for (const a of agents) {
    const existing = (a.features as Record<string, unknown>) ?? {};
    const merged   = { ...existing, [configKey]: { ...(existing[configKey] as object ?? {}), ...configValue } };
    const { error } = await supabase.from('voice_agents').update({ features: merged }).eq('id', a.id);
    if (error) return { error: error.message };
  }
  return {};
}
