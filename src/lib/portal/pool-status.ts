import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fuente única de verdad para computar el estado del pool de minutos/tareas
 * de una organización desde el punto de vista de la UI del cliente.
 *
 * Origen del bug read-path (2026-08-11): usar `??` sobre `account_minutes.minutes_included = 0`
 * y no considerar la suma per-empleado como fallback. El cliente veía "Jornada
 * sin minutos" aunque sus empleados tuvieran minutos asignados. Este helper
 * centraliza el fallback ladder para que TODAS las vistas del portal muestren
 * los mismos números.
 *
 * Ladder para minutos (poolActive = account_minutes.minutes_included > 0):
 *   1. account_minutes si poolActive
 *   2. SUM(voice_agents.minutes_* WHERE active=true) si suma > 0
 *   3. agentFallback (primary agent — solo válido en demo/standalone)
 *
 * Ladder para tareas (limit):
 *   1. organizations.monthly_ops_pool si != null
 *   2. account_ops.ops_included si > 0 (edge case: migración incompleta)
 *   3. SUM(voice_agents.ai_ops_limit WHERE active=true)
 *
 * Ladder para tareas (used):
 *   1. account_ops.ops_used si ops_ledger_enabled (source of truth post-flip)
 *   2. organizations.monthly_ops_used si orgPoolTotal != null
 *   3. SUM(voice_agents.ai_ops_used WHERE active=true)
 *
 * NOTA: activePeers filtra `active !== false` — un empleado pausado no debe
 * inflar el pool visible al cliente (finding audit F6).
 */

export interface PoolStatus {
  minutesIncluded:  number;
  minutesUsed:      number;
  minutesRemain:    number;
  minutesResetDate: string | null;
  aiOpsUsed:        number;
  aiOpsLimit:       number;
  ledgerEnabled:    boolean;
  poolActive:       boolean;
  orgPoolTotal:     number | null;
  orgPoolUsed:      number | null;
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
  orgSettings:   { monthly_ops_pool?: number | null; monthly_ops_used?: number | null; ops_ledger_enabled?: boolean | null } | null;
  acctOps:       { ops_used?: number | null; ops_included?: number | null } | null;
  peerAgents:    Array<{ minutes_included?: number | null; minutes_used?: number | null; ai_ops_used?: number | null; ai_ops_limit?: number | null; active?: boolean | null }>;
  agentFallback?: AgentFallback;
}

/**
 * Pure function — para callers que ya tienen los datos fetcheados (page.tsx
 * hace un Promise.all grande y no queremos duplicar queries).
 */
export function computePoolStatus(input: PoolStatusInput): PoolStatus {
  const { acctMins, orgSettings, acctOps, peerAgents, agentFallback } = input;

  const ledgerEnabled = !!orgSettings?.ops_ledger_enabled;
  const activePeers   = peerAgents.filter(a => a.active !== false);

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
  const orgPoolTotal = (orgSettings?.monthly_ops_pool as number | null) ?? null;
  const orgPoolUsed  = (orgSettings?.monthly_ops_used as number | null) ?? null;
  const summedAiOpsUsed  = activePeers.reduce(
    (s, a) => s + ((a.ai_ops_used as number) ?? 0), 0);
  const summedAiOpsLimit = activePeers.reduce(
    (s, a) => s + ((a.ai_ops_limit as number) ?? 0), 0);

  const aiOpsLimit = orgPoolTotal != null
    ? orgPoolTotal
    : typeof acctOps?.ops_included === 'number' && acctOps.ops_included > 0
      ? acctOps.ops_included
      : summedAiOpsLimit > 0
        ? summedAiOpsLimit
        : (agentFallback?.ai_ops_limit ?? 0);

  const aiOpsUsed = ledgerEnabled && typeof acctOps?.ops_used === 'number'
    ? acctOps.ops_used
    : orgPoolTotal != null
      ? (orgPoolUsed ?? 0)
      : summedAiOpsLimit > 0
        ? summedAiOpsUsed
        : (agentFallback?.ai_ops_used ?? 0);

  return {
    minutesIncluded,
    minutesUsed,
    minutesRemain: Math.max(0, minutesIncluded - minutesUsed),
    minutesResetDate: acctMins?.minutes_reset_date ?? agentFallback?.minutes_reset_date ?? null,
    aiOpsUsed,
    aiOpsLimit,
    ledgerEnabled,
    poolActive,
    orgPoolTotal,
    orgPoolUsed,
  };
}

/**
 * Convenience wrapper — hace los 3-4 fetches y llama computePoolStatus.
 * Para callers simples (layouts, loaders) que no tienen los datos ya.
 */
export async function loadPoolStatus(
  supabase: SupabaseClient,
  portalEmail: string | null,
  agentFallback?: AgentFallback,
): Promise<PoolStatus> {
  if (!portalEmail) {
    return computePoolStatus({
      acctMins:    null,
      orgSettings: null,
      acctOps:     null,
      peerAgents:  [],
      agentFallback,
    });
  }

  const [acctMinsRes, orgSettingsRes, peerAgentsRes] = await Promise.all([
    supabase.from('account_minutes')
      .select('minutes_used, minutes_included, minutes_reset_date')
      .eq('portal_email', portalEmail)
      .maybeSingle(),
    supabase.from('organizations')
      .select('monthly_ops_pool, monthly_ops_used, ops_ledger_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle(),
    supabase.from('voice_agents')
      .select('minutes_included, minutes_used, ai_ops_used, ai_ops_limit, active')
      .eq('portal_email', portalEmail),
  ]);

  const orgSettings = orgSettingsRes.data as PoolStatusInput['orgSettings'];
  const ledgerEnabled = !!orgSettings?.ops_ledger_enabled;
  const orgPoolTotal  = (orgSettings?.monthly_ops_pool as number | null) ?? null;

  // Solo pedimos account_ops si aporta (ledger source of truth O edge case
  // migración sin populate del org pool). Evita un roundtrip cuando no aplica.
  const needAcctOps = ledgerEnabled || orgPoolTotal == null;
  const acctOpsRes = needAcctOps
    ? await supabase.from('account_ops')
        .select('ops_used, ops_included')
        .eq('portal_email', portalEmail)
        .maybeSingle()
    : { data: null };

  return computePoolStatus({
    acctMins:    acctMinsRes.data as PoolStatusInput['acctMins'],
    orgSettings,
    acctOps:     acctOpsRes.data as PoolStatusInput['acctOps'],
    peerAgents:  (peerAgentsRes.data ?? []) as PoolStatusInput['peerAgents'],
    agentFallback,
  });
}
