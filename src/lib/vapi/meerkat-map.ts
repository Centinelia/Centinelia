import { MEERKAT_CONFIGS } from './meerkat-configs';

export function getMeerkatIdForAgentRow(
  agent: { features?: unknown } | null | undefined,
): string | null {
  if (!agent?.features || typeof agent.features !== 'object') return null;
  const rid = (agent.features as Record<string, unknown>).meerkat_role_id;
  if (typeof rid !== 'string' || !rid) return null;
  if (!MEERKAT_CONFIGS[rid]) return null;
  return rid;
}
