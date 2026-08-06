/**
 * Gate compartido: decide si un empleado puede correr una campaña de una
 * capability dada. Se usa en POST /salientes/campanas al crear, en PATCH
 * al editar, y en el cron al disparar (defensa en profundidad — si algo
 * pasó el gate de creación mal, el cron lo atrapa).
 *
 * Reglas:
 * - outbound_calls debe estar activo. Sin él, ninguna campaña corre.
 * - Si capability === 'custom': basta con outbound_calls activo.
 * - Si capability es del catálogo: debe estar en features.outbound_capabilities
 *   del meerkat asignado.
 */

import { MEERKAT_MAP } from '@/lib/portal/meerkat-roles';
import { isValidOutboundCapability } from '@/lib/portal/outbound-capabilities';
import type { AgentFeatures } from '@/types/agent';

export interface OutboundGateAgent {
  outbound_calls?:  boolean | null;
  features?:        Partial<AgentFeatures> | null;
  /** meerkat_role_id, usualmente vive en features.meerkat_role_id */
  meerkat_role_id?: string | null;
}

export interface OutboundGateResult {
  ok:     boolean;
  reason?: string;
}

export function canRunOutboundCampaign(
  agent: OutboundGateAgent,
  capability: string
): OutboundGateResult {
  const outboundOn = agent.outbound_calls === true || agent.features?.outbound_calls === true;
  if (!outboundOn) {
    return { ok: false, reason: 'Este empleado no tiene llamadas salientes activadas.' };
  }

  if (capability === 'custom') return { ok: true };

  if (!isValidOutboundCapability(capability)) {
    return { ok: false, reason: `Tipo de campaña desconocido: ${capability}` };
  }

  const meerkatId = agent.meerkat_role_id ?? agent.features?.meerkat_role_id ?? null;

  // Agent-level allowlist wins over meerkat defaults (permite overrides)
  const agentCaps = agent.features?.outbound_capabilities;
  if (Array.isArray(agentCaps)) {
    if (agentCaps.includes(capability)) return { ok: true };
    return { ok: false, reason: 'Este empleado no puede correr campañas de este tipo.' };
  }

  const meerkatMap = MEERKAT_MAP as Record<string, { features: { outbound_capabilities?: string[] } }>;
  if (meerkatId && meerkatMap[meerkatId]) {
    const meerkatCaps = meerkatMap[meerkatId].features.outbound_capabilities ?? [];
    if (meerkatCaps.includes(capability)) return { ok: true };
    return { ok: false, reason: 'Este empleado no puede correr campañas de este tipo.' };
  }

  return { ok: false, reason: 'Este empleado no puede correr campañas de este tipo.' };
}
