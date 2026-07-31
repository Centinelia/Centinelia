/**
 * Gate verdict computation — shared between gate-status route (read) and
 * activate route (server-side enforcement).
 *
 * Extracted to prevent client-supplied gate_verdict from bypassing the gate
 * in the activate endpoint (C1 security fix).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { type MeerkatId, type GateVerdict } from './types';

export const DELTA_WARN_THRESHOLD = -0.02;
export const DELTA_FAIL_THRESHOLD = -0.05;
export const ABSOLUTE_BOOTSTRAP_MIN = 0.70;

export interface GateVerdictResult {
  verdict: GateVerdict;
  delta: number | null;
  active: { version: number; median: number; scenarios_scored: number } | null;
  target: {
    version: number;
    median: number | null;
    scenarios_scored: number;
    run_status: 'none' | 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
  };
}

/**
 * Computes the gate verdict for (meerkat, targetVersion) server-side.
 * Does NOT trust any client-supplied verdict.
 */
export async function computeGateVerdict(
  meerkatId: MeerkatId,
  targetVersion: number,
): Promise<GateVerdictResult> {
  const supabase = createAdminClient();

  const { data: activeRow } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkatId)
    .maybeSingle();
  const activeVersion = activeRow?.active_version ?? null;

  const versionsToFetch = Array.from(
    new Set([activeVersion, targetVersion].filter((v): v is number => v != null)),
  );

  const { data: baselines } = await supabase
    .from('golden_test_baselines')
    .select('version, median_score, scenario_scores')
    .eq('meerkat_id', meerkatId)
    .in('version', versionsToFetch);

  const baselineByVersion = new Map(
    (baselines ?? []).map(b => [b.version as number, b]),
  );

  const { data: runInProgress } = await supabase
    .from('golden_test_runs')
    .select('id, status, total_scenarios, completed_scenarios, versions')
    .eq('meerkat_id', meerkatId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const targetBaseline = baselineByVersion.get(targetVersion);
  const activeBaseline = activeVersion != null ? baselineByVersion.get(activeVersion) : undefined;

  const targetInRun = (runInProgress?.versions as number[] | null)?.includes(targetVersion) ?? false;

  const runStatus: GateVerdictResult['target']['run_status'] = targetBaseline
    ? 'completed'
    : targetInRun
      ? (runInProgress!.status as 'queued' | 'running')
      : 'none';

  // Baseline exists → always report 100% complete, even if a rerun happens to be in progress.
  // (Race window: baseline write vs later run picking up target again.)
  const targetProgress = targetBaseline
    ? 1
    : targetInRun && (runInProgress!.total_scenarios as number) > 0
      ? (runInProgress!.completed_scenarios as number) / (runInProgress!.total_scenarios as number)
      : 0;

  const targetScored = targetBaseline
    ? Object.keys(targetBaseline.scenario_scores ?? {}).length
    : targetInRun
      ? Math.round(((runInProgress!.completed_scenarios as number) ?? 0) / 3)
      : 0;

  const activeScored = activeBaseline
    ? Object.keys(activeBaseline.scenario_scores ?? {}).length
    : 0;

  // Compute verdict
  let verdict: GateVerdict = 'incomplete';
  let delta: number | null = null;

  if (targetBaseline && activeVersion === targetVersion) {
    // No-op reactivation
    verdict = 'pass';
  } else if (targetBaseline && activeBaseline) {
    delta = Number(targetBaseline.median_score) - Number(activeBaseline.median_score);
    if (delta >= DELTA_WARN_THRESHOLD) verdict = 'pass';
    else if (delta >= DELTA_FAIL_THRESHOLD) verdict = 'warn';
    else verdict = 'fail';
  } else if (targetBaseline && !activeBaseline) {
    // Bootstrap: first version, no active baseline to compare against
    verdict = Number(targetBaseline.median_score) >= ABSOLUTE_BOOTSTRAP_MIN ? 'pass' : 'fail';
  }
  // else: no target baseline -> 'incomplete' (default)

  return {
    verdict,
    delta,
    active: activeBaseline
      ? {
          version: activeVersion!,
          median: Number(activeBaseline.median_score),
          scenarios_scored: activeScored,
        }
      : null,
    target: {
      version: targetVersion,
      median: targetBaseline ? Number(targetBaseline.median_score) : null,
      scenarios_scored: targetScored,
      run_status: runStatus,
      progress: targetProgress,
    },
  };
}
