/**
 * Service de CRUD para Reglas de operación (agent_rules).
 *
 * Convenciones:
 * - PAC-1: FK a organizations por portal_email TEXT, no org_id UUID.
 * - PAC-2: applies_to contiene valores de voice_agents.features->>meerkat_role_id.
 * - Cobro: 1 op de setup al crear (consumeAiOp via agente primario del org).
 *   Editar/borrar = 0 ops (spec Sección 8.3).
 * - Cache: se invalida automáticamente al mutar.
 *
 * Ver spec Sección 4.4 y 8.1.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { validateCreateRuleInput, type CreateRuleInput } from './validation';
import { invalidateRulesCache } from './cache';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export interface AgentRule {
  id: string;
  portal_email: string;
  regla: string;
  detalles: string | null;
  applies_to: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Crea una nueva regla de operación.
 * Valida input, inserta en DB, cobra 1 op al agente primario del org, invalida cache.
 */
export async function createRule(input: CreateRuleInput): Promise<AgentRule> {
  const validation = await validateCreateRuleInput(input, { rosterCheck: true });
  if (!validation.ok) throw new Error(validation.error);

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('agent_rules')
    .insert({
      portal_email: input.portalEmail,
      regla:        input.regla,
      detalles:     input.detalles ?? null,
      applies_to:   input.applies_to ?? [],
      created_by:   input.created_by ?? null,
      active:       input.active ?? true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const rule = data as AgentRule;

  // Cobrar 1 op de setup al agente primario del org (spec 8.1 rule_setup).
  // consumeAiOp requiere agentId (voice_agents.id), no portal_email directamente.
  // Buscamos el primer agente activo del org para el cobro.
  const primaryAgentId = await getPrimaryAgentId(input.portalEmail);
  if (primaryAgentId) {
    await consumeAiOp(primaryAgentId, 1, {
      source:       'rule_setup',
      reference_id: rule.id,
      label:        `Regla creada: ${input.regla.slice(0, 60)}`,
    });
  }

  await invalidateRulesCache(input.portalEmail);

  return rule;
}

/**
 * Actualiza campos de una regla existente.
 * Sin cobro (editar = 0 ops). Invalida cache.
 */
export async function updateRule(
  id: string,
  patch: Partial<Omit<CreateRuleInput, 'portalEmail'>>,
): Promise<AgentRule> {
  const updateData: Record<string, unknown> = {};
  if (patch.regla     !== undefined) updateData.regla     = patch.regla;
  if (patch.detalles  !== undefined) updateData.detalles  = patch.detalles;
  if (patch.applies_to !== undefined) updateData.applies_to = patch.applies_to;
  if (patch.active    !== undefined) updateData.active    = patch.active;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('agent_rules')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const rule = data as AgentRule;
  await invalidateRulesCache(rule.portal_email);

  return rule;
}

/**
 * Elimina una regla. Sin cobro. Invalida cache.
 */
export async function deleteRule(id: string): Promise<void> {
  const supabase = createAdminClient();

  // Obtener portal_email antes de borrar para invalidar cache
  const { data: existing } = await supabase
    .from('agent_rules')
    .select('portal_email')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('agent_rules')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);

  if (existing?.portal_email) {
    await invalidateRulesCache(existing.portal_email as string);
  }
}

/**
 * Lista las reglas de un org. Opcionalmente filtra solo activas.
 */
export async function listRulesForOrg(
  portalEmail: string,
  opts: { activeOnly?: boolean } = {},
): Promise<AgentRule[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('agent_rules')
    .select('*')
    .eq('portal_email', portalEmail);

  if (opts.activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []) as AgentRule[];
}

/**
 * Retorna las reglas activas aplicables a un meerkat específico.
 * Usa el RPC `get_rules_for_agent` que filtra por portal_email + meerkat_role_id.
 *
 * La lógica de filtro en el RPC es:
 *   applies_to = '{}' (vacío) → aplica a TODOS los meerkats del org
 *   p_meerkat_role_id = ANY(applies_to) → aplica a este meerkat específico
 */
export async function getRulesForAgent(
  portalEmail: string,
  meerkatRoleId: string,
): Promise<AgentRule[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('get_rules_for_agent', {
    p_portal_email:    portalEmail,
    p_meerkat_role_id: meerkatRoleId,
  });

  if (error) throw new Error(error.message);

  return (data ?? []) as AgentRule[];
}

// ─── helpers internos ────────────────────────────────────────────────────────

/**
 * Retorna el ID del primer agente activo del org ordenado por created_at.
 * Usado para cobrar ops cuando no hay un agentId directo (ej. rule_setup).
 * Retorna null si el org no tiene agentes activos (evita crash silencioso).
 */
async function getPrimaryAgentId(portalEmail: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}
