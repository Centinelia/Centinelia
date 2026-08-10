import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import type { NextRequest } from 'next/server';

export interface AgentAccess {
  /**
   * ID del "primer agente activo" del org (por created_at asc). Determinístico
   * pero arbitrario — sin concepto de "primario" post-migración org-level.
   * Se mantiene por retrocompat con call-sites que usan `access.primaryId`
   * para writes agent-scoped. Idealmente ese pattern se refactoriza a org-scoped.
   */
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
 *
 * Acepta ambos formatos de token: `organizations.portal_token` (nuevo) o
 * `voice_agents.portal_token` (legacy) via {@link resolveOrgFromToken}.
 */
export async function getAgentAccess(
  token: string,
  req?: NextRequest,
): Promise<AgentAccess | null> {
  const supabase = createAdminClient();

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return null;

  const { data: accountRows } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true }) as { data: Array<{ id: string }> | null };

  const accountIds = (accountRows ?? []).map(a => a.id);
  if (accountIds.length === 0) return null;

  const primaryId = accountIds[0];

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
        const filtered = accountIds.filter(id => allowed.includes(id));
        return {
          primaryId,
          ids:         filtered.length > 0 ? filtered : [primaryId],
          portalEmail: resolved.portalEmail,
        };
      }
    }
  }

  return { primaryId, ids: accountIds, portalEmail: resolved.portalEmail };
}
