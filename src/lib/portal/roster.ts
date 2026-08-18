import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Retorna los IDs de TODOS los meerkats activos del org identificado por
 * portalEmail. Usar para expandir queries que hoy filtran por un solo
 * `agent_id` (el primary) a filtros org-scoped `.in('agent_id', roster)`.
 *
 * Contexto: muchos endpoints portal usaban `.eq('agent_id', agent.id)` con
 * el primary como referencia, dejando peers invisibles en dashboards y
 * detalles per-recurso. Ver [[handoff-peer-discrimination-fix]] audit
 * 2026-08-18.
 *
 * @param supabase Cliente admin
 * @param portalEmail Email del org. Si null, retorna [fallbackAgentId] para
 *   preservar comportamiento demo standalone.
 * @param fallbackAgentId Agent id que se usa cuando no hay portal_email.
 * @param onlyActive Si true (default), solo agents con active=true.
 */
export async function getOrgAgentIds(
  supabase:        SupabaseClient,
  portalEmail:     string | null,
  fallbackAgentId: string,
  onlyActive:      boolean = true,
): Promise<string[]> {
  if (!portalEmail) return [fallbackAgentId];

  const q = supabase.from('voice_agents').select('id').eq('portal_email', portalEmail);
  const { data } = onlyActive
    ? await q.eq('active', true)
    : await q;

  const ids = (data ?? []).map((a: { id: string }) => a.id);
  return ids.length > 0 ? ids : [fallbackAgentId];
}
