import { createAdminClient } from '@/lib/supabase/admin';
import { GOLDEN_SCENARIOS } from './registry';
import type { MeerkatId, GoldenScenario } from './types';

export const N_ATTEMPTS = 3;
export const DAILY_CAP = 500;
export const MEDIAN_THRESHOLD_PASS = 0.70;

export interface RunRow {
  id: string;
  meerkat_id: MeerkatId;
  versions: number[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  scenario_hash: string;
  total_scenarios: number;
  completed_scenarios: number;
}

function calibratedScenarios(meerkatId: MeerkatId): GoldenScenario[] {
  return (GOLDEN_SCENARIOS[meerkatId] ?? []).filter(s => s.calibrated_at != null);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * total = calibrated scenarios × versions × N_ATTEMPTS.
 * Non-calibrated scenarios still run to accumulate data but are NOT counted in total.
 */
export function computeTotalScenarios(meerkatId: MeerkatId, versions: number[]): number {
  return calibratedScenarios(meerkatId).length * versions.length * N_ATTEMPTS;
}

/**
 * Finds the next (scenario × version × attempt) triple for the given run
 * that does not yet have a row in golden_test_scenario_runs.
 *
 * Ordering: versions outer → scenarios inner → attempts inner.
 * Iterates ALL scenarios (calibrated + non-calibrated) so both generate data.
 * Returns null when everything is done.
 */
export async function findNextPendingScenario(
  runId: string,
): Promise<{ scenario_id: string; version: number; attempt: number; scenario: GoldenScenario } | null> {
  const supabase = createAdminClient();

  const { data: run, error: runErr } = await supabase
    .from('golden_test_runs')
    .select('meerkat_id, versions')
    .eq('id', runId)
    .maybeSingle();

  if (runErr || !run) return null;

  const scenarios = GOLDEN_SCENARIOS[run.meerkat_id as MeerkatId] ?? [];
  if (scenarios.length === 0) return null;

  const { data: existing } = await supabase
    .from('golden_test_scenario_runs')
    .select('scenario_id, version, attempt')
    .eq('run_id', runId);

  const done = new Set(
    (existing ?? []).map(e => `${e.scenario_id}|${e.version}|${e.attempt}`),
  );

  for (const version of run.versions as number[]) {
    for (const scenario of scenarios) {
      for (let attempt = 1; attempt <= N_ATTEMPTS; attempt++) {
        const key = `${scenario.id}|${version}|${attempt}`;
        if (!done.has(key)) {
          return { scenario_id: scenario.id, version, attempt, scenario };
        }
      }
    }
  }

  return null;
}

/**
 * Acquires the next queued or running run via SELECT FOR UPDATE SKIP LOCKED.
 * Returns null if no run is available or on error.
 */
export async function acquireNextRun(): Promise<RunRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('golden_run_lock_next');
  if (error) {
    console.error('[orchestrator] acquireNextRun error', error.message);
    return null;
  }
  if (!data || (data as unknown[]).length === 0) return null;
  const row = (data as RunRow[])[0];
  return {
    id: row.id,
    meerkat_id: row.meerkat_id,
    versions: row.versions,
    status: row.status,
    scenario_hash: row.scenario_hash,
    total_scenarios: row.total_scenarios,
    completed_scenarios: row.completed_scenarios,
  };
}

export async function markRunStarted(runId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('golden_test_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued');
}

export async function markRunCompleted(runId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('golden_test_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId);
}

/**
 * Read-modify-write increment of completed_scenarios.
 * Safe because the worker is single-writer per run (guaranteed by SELECT FOR UPDATE SKIP LOCKED).
 */
export async function bumpCompletedScenarios(runId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('golden_test_runs')
    .select('completed_scenarios')
    .eq('id', runId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from('golden_test_runs')
    .update({ completed_scenarios: (data.completed_scenarios ?? 0) + 1 })
    .eq('id', runId);
}

/**
 * On run completion: compute per-scenario medians, then compute the aggregate
 * median_score (mean of medians of CALIBRATED scenarios only), and UPSERT
 * into golden_test_baselines per (meerkat_id, version).
 *
 * Non-calibrated scenarios are included in scenario_scores JSONB for informational
 * purposes but do NOT affect median_score.
 *
 * If a version has no calibrated scenarios with valid scores, that version's
 * baseline is skipped (warn logged).
 */
export async function computeAndUpsertBaselines(runId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: run } = await supabase
    .from('golden_test_runs')
    .select('meerkat_id, versions, scenario_hash')
    .eq('id', runId)
    .maybeSingle();
  if (!run) return;

  const { data: scenarioRuns } = await supabase
    .from('golden_test_scenario_runs')
    .select('scenario_id, version, score')
    .eq('run_id', runId);

  const calibratedIds = new Set(
    calibratedScenarios(run.meerkat_id as MeerkatId).map(s => s.id),
  );

  for (const version of run.versions as number[]) {
    // Group scores by scenario_id for this version
    const byScenario = new Map<string, number[]>();
    for (const sr of scenarioRuns ?? []) {
      if (sr.version !== version) continue;
      if (sr.score == null) continue;
      const arr = byScenario.get(sr.scenario_id) ?? [];
      arr.push(Number(sr.score));
      byScenario.set(sr.scenario_id, arr);
    }

    // Compute per-scenario medians (all scenarios — informational)
    const scenarioScores: Record<string, number> = {};
    for (const [sid, scores] of byScenario) {
      scenarioScores[sid] = median(scores);
    }

    // median_score = mean of medians of CALIBRATED scenarios only
    const calibratedMedians = Object.entries(scenarioScores)
      .filter(([sid]) => calibratedIds.has(sid))
      .map(([, m]) => m);

    if (calibratedMedians.length === 0) {
      console.warn('[orchestrator] no calibrated scenarios with valid scores', { runId, version });
      continue;
    }

    const rawMedianScore =
      calibratedMedians.reduce((a, b) => a + b, 0) / calibratedMedians.length;
    const medianScore = Math.round(rawMedianScore * 100) / 100;

    await supabase.from('golden_test_baselines').upsert(
      {
        meerkat_id: run.meerkat_id,
        version,
        run_id: runId,
        median_score: medianScore,
        scenario_scores: scenarioScores,
        scenario_hash: run.scenario_hash,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'meerkat_id,version' },
    );
  }
}

/**
 * Checks whether we are within the daily cap of scenario runs.
 * Counts rows in golden_test_scenario_runs created in the last 24 hours.
 */
export async function checkDailyCap(): Promise<{ within: boolean; count: number }> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('golden_test_scenario_runs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since);
  const n = count ?? 0;
  return { within: n < DAILY_CAP, count: n };
}
