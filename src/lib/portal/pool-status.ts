import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fuente única de verdad para computar el estado del pool de minutos/tareas
 * de una organización desde el punto de vista de la UI del cliente.
 *
 * Historia:
 * - 2026-08-11: creado para unificar el fallback ladder después del bug
 *   "Jornada sin minutos" en Pneuma (acct_minutes.minutes_included=0 pero
 *   los agentes tenían minutos sembrados).
 * - 2026-10-09: eliminado el fallback a campos legacy
 *   (organizations.monthly_ops_pool/used, voice_agents.ai_ops_used). El
 *   ledger (account_ops como mirror del ops_ledger) es la ÚNICA fuente
 *   para ops consumidas. ai_ops_limit se preserva como CONFIG del plan
 *   (cap derivado por SUM(voice_agents.ai_ops_limit)).
 *
 * Minutos (mantienen fallback ladder):
 *   1. account_minutes si minutes_included > 0
 *   2. SUM(voice_agents.minutes_* WHERE active=true) si suma > 0
 *   3. agentFallback (demo/standalone)
 *
 * Tareas (post-cleanup):
 *   used  = account_ops.ops_used (desde el mirror del ledger)
 *   limit = account_ops.ops_included (cap derivado) o SUM(ai_ops_limit activos)
 */

export interface PoolStatus {
  minutesIncluded:  number;
  minutesUsed:      number;
  minutesRemain:    number;
  minutesResetDate: string | null;
  aiOpsUsed:        number;
  aiOpsLimit:       number;
  poolActive:       boolean;
}

export interface AgentFallback {
  minutes_included?:   number | null;
  minutes_used?:       number | null;
  minutes_reset_date?: string | null;
  ai_ops_used?:        number | null;
  ai_ops_limit?:       number | null;
}

export interface PoolStatusInput {
  acctMins:      { minutes_used?: number | null; minutes_included?: number | null; minutes_reset_date?: string | null } | null;
  acctOps:       { ops_used?: number | null; ops_included?: number | null } | null;
  peerAgents:    Array<{ minutes_included?: number | null; minutes_used?: number | null; ai_ops_limit?: number | null; active?: boolean | null }>;
  agentFallback?: AgentFallback;
}

/**
 * Pure function — para callers que ya tienen los datos fetcheados (page.tsx
 * hace un Promise.all grande y no queremos duplicar queries).
 */
export function computePoolStatus(input: PoolStatusInput): PoolStatus {
  const { acctMins, acctOps, peerAgents, agentFallback } = input;

  const activePeers = peerAgents.filter(a => a.active !== false);

  // ── Minutos ──────────────────────────────────────────────────────────────
  const acctMinsIncluded = acctMins?.minutes_included;
  const acctMinsUsed     = acctMins?.minutes_used;
  const poolActive       = typeof acctMinsIncluded === 'number' && acctMinsIncluded > 0;

  const summedMinutesIncluded = activePeers.reduce(
    (s, a) => s + ((a.minutes_included as number) ?? 0), 0);
  const summedMinutesUsed = activePeers.reduce(
    (s, a) => s + ((a.minutes_used as number) ?? 0), 0);

  const minutesIncluded = poolActive
    ? acctMinsIncluded
    : summedMinutesIncluded > 0
      ? summedMinutesIncluded
      : (agentFallback?.minutes_included ?? 0);
  const minutesUsed = poolActive
    ? (acctMinsUsed ?? 0)
    : summedMinutesIncluded > 0
      ? summedMinutesUsed
      : (agentFallback?.minutes_used ?? 0);

  // ── Tareas / Ops ────────────────────────────────────────────────────────
  // Fuente única: account_ops (mirror del ops_ledger).
  // Si no hay row (edge case: org recién creada, standalone demo), caemos
  // al cap derivado de SUM(ai_ops_limit activos). ops_used queda en 0 porque
  // sin row del mirror no sabemos consumo.
  const summedAiOpsLimit = activePeers.reduce(
    (s, a) => s + ((a.ai_ops_limit as number) ?? 0), 0);

  const aiOpsLimit = typeof acctOps?.ops_included === 'number' && acctOps.ops_included > 0
    ? acctOps.ops_included
    : summedAiOpsLimit > 0
      ? summedAiOpsLimit
      : (agentFallback?.ai_ops_limit ?? 0);

  const aiOpsUsed = typeof acctOps?.ops_used === 'number'
    ? acctOps.ops_used
    : 0;

  return {
    minutesIncluded,
    minutesUsed,
    minutesRemain: Math.max(0, minutesIncluded - minutesUsed),
    minutesResetDate: acctMins?.minutes_reset_date ?? agentFallback?.minutes_reset_date ?? null,
    aiOpsUsed,
    aiOpsLimit,
    poolActive,
  };
}

/**
 * Convenience wrapper — hace los 3 fetches y llama computePoolStatus.
 * Para callers simples (layouts, loaders) que no tienen los datos ya.
 */
export async function loadPoolStatus(
  supabase: SupabaseClient,
  portalEmail: string | null,
  agentFallback?: AgentFallback,
): Promise<PoolStatus> {
  if (!portalEmail) {
    return computePoolStatus({
      acctMins:   null,
      acctOps:    null,
      peerAgents: [],
      agentFallback,
    });
  }

  const [acctMinsRes, acctOpsRes, peerAgentsRes] = await Promise.all([
    supabase.from('account_minutes')
      .select('minutes_used, minutes_included, minutes_reset_date')
      .eq('portal_email', portalEmail)
      .maybeSingle(),
    supabase.from('account_ops')
      .select('ops_used, ops_included')
      .eq('portal_email', portalEmail)
      .maybeSingle(),
    supabase.from('voice_agents')
      .select('minutes_included, minutes_used, ai_ops_limit, active')
      .eq('portal_email', portalEmail),
  ]);

  return computePoolStatus({
    acctMins:   acctMinsRes.data as PoolStatusInput['acctMins'],
    acctOps:    acctOpsRes.data as PoolStatusInput['acctOps'],
    peerAgents: (peerAgentsRes.data ?? []) as PoolStatusInput['peerAgents'],
    agentFallback,
  });
}
