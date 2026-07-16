import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import type { NextRequest } from 'next/server';

export interface AgentAccess {
  /** ID del agente identificado por el portal_token (el "principal" — usado en writes) */
  primaryId:   string;
  /** Todos los agent_ids accesibles para el usuario actual de la sesión */
  ids:         string[];
  portalEmail: string;
}

/**
 * Devuelve los agent_ids accesibles para la sesión actual.
 *
 * - Owner o sin sesión  → todos los agentes activos de la cuenta.
 * - Sub-usuario con agent_ids asignados → solo esos (intersectado con la cuenta).
 * - Sub-usuario sin agent_ids            → todos los agentes de la cuenta.
 */
export async function getAgentAccess(
  token: string,
  req?: NextRequest,
): Promise<AgentAccess | null> {
  const supabase = createAdminClient();

  type AgentRow = { id: string; portal_email: string };

  const { data: primary } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single() as { data: AgentRow | null };

  if (!primary) return null;

  // Todos los agentes activos de la cuenta
  const { data: accountRows } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', primary.portal_email)
    .eq('active', true) as { data: Array<{ id: string }> | null };

  const accountIds = (accountRows ?? []).map(a => a.id);
  const allIds     = accountIds.length > 0 ? accountIds : [primary.id];

  // Filtrado por session de sub-usuario cuando se pasa el request
  if (req) {
    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);

    if (session?.isSubUser && session.userId) {
      type UserRow = { agent_ids: string[] | null };
      const { data: user } = await supabase
        .from('portal_users')
        .select('agent_ids')
        .eq('id', session.userId)
        .single() as { data: UserRow | null };

      const allowed = user?.agent_ids ?? [];
      if (allowed.length > 0) {
        const filtered = allIds.filter(id => allowed.includes(id));
        return {
          primaryId:   primary.id,
          ids:         filtered.length > 0 ? filtered : [primary.id],
          portalEmail: primary.portal_email,
        };
      }
    }
  }

  return { primaryId: primary.id, ids: allIds, portalEmail: primary.portal_email };
}
