import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

interface Params { params: Promise<{ runId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { runId } = await params;
  const supabase = createAdminClient();

  const { data: run, error } = await supabase
    .from('golden_test_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();

  if (error || !run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const { data: recentRuns } = await supabase
    .from('golden_test_scenario_runs')
    .select('scenario_id, version, attempt, score, scenario_passed, duration_ms, cost_usd, error, created_at')
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(20);

  const progress = run.total_scenarios > 0
    ? Math.round((run.completed_scenarios / run.total_scenarios) * 100) / 100
    : 0;

  return NextResponse.json({ run: { ...run, progress }, recent_scenario_runs: recentRuns ?? [] });
}
