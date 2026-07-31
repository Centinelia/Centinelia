import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_IDS, type MeerkatId, type GateStatus, type GateVerdict } from '@/lib/golden-tests/types';

const DELTA_WARN_THRESHOLD = -0.02;
const DELTA_FAIL_THRESHOLD = -0.05;
const ABSOLUTE_BOOTSTRAP_MIN = 0.70;

interface Params { params: Promise<{ meerkat: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { meerkat } = await params;
  const target = Number(new URL(req.url).searchParams.get('target'));

  if (!MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!Number.isInteger(target) || target < 1) {
    return NextResponse.json({ error: 'target must be integer >= 1' }, { status: 400 });
  }

  const meerkatId = meerkat as MeerkatId;
  const supabase = createAdminClient();

  const { data: activeRow } = await supabase
    .from('meerkat_active_versions')
    .select('active_version')
    .eq('meerkat_id', meerkatId)
    .maybeSingle();
  const activeVersion = activeRow?.active_version ?? null;

  const versionsToFetch = Array.from(
    new Set([activeVersion, target].filter((v): v is number => v != null)),
  );

  const { data: baselines } = await supabase
    .from('golden_test_baselines')
    .select('version, median_score, scenario_scores')
    .eq('meerkat_id', meerkatId)
    .in('version', versionsToFetch);

  const baselineByVersion = new Map(
    (baselines ?? []).map(b => [b.version as number, b]),
  );

  // Check for an in-progress run for this meerkat covering the target version
  const { data: runInProgress } = await supabase
    .from('golden_test_runs')
    .select('id, status, total_scenarios, completed_scenarios, versions')
    .eq('meerkat_id', meerkatId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const targetBaseline = baselineByVersion.get(target);
  const activeBaseline = activeVersion != null ? baselineByVersion.get(activeVersion) : undefined;

  const targetInRun = (runInProgress?.versions as number[] | null)?.includes(target) ?? false;

  const runStatus: GateStatus['target']['run_status'] = targetBaseline
    ? 'completed'
    : targetInRun
      ? (runInProgress!.status as 'queued' | 'running')
      : 'none';

  const targetProgress = targetInRun && (runInProgress!.total_scenarios as number) > 0
    ? (runInProgress!.completed_scenarios as number) / (runInProgress!.total_scenarios as number)
    : targetBaseline
      ? 1
      : 0;

  // scenarios_scored: for a completed baseline, count keys in scenario_scores
  const targetScored = targetBaseline
    ? Object.keys(targetBaseline.scenario_scores ?? {}).length
    : targetInRun
      ? Math.round(((runInProgress!.completed_scenarios as number) ?? 0) / 3)
      : 0;

  // Determine verdict
  let verdict: GateVerdict = 'incomplete';
  let delta: number | null = null;

  if (targetBaseline && activeVersion === target) {
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

  const activeScored = activeBaseline
    ? Object.keys(activeBaseline.scenario_scores ?? {}).length
    : 0;

  const response: GateStatus = {
    meerkat_id: meerkatId,
    active: activeBaseline
      ? {
          version: activeVersion!,
          median: Number(activeBaseline.median_score),
          scenarios_scored: activeScored,
        }
      : null,
    target: {
      version: target,
      median: targetBaseline ? Number(targetBaseline.median_score) : null,
      scenarios_scored: targetScored,
      run_status: runStatus,
      progress: targetProgress,
    },
    delta,
    verdict,
  };

  return NextResponse.json(response);
}
