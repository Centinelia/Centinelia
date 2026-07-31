export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  acquireNextRun,
  findNextPendingScenario,
  markRunStarted,
  markRunCompleted,
  bumpCompletedScenarios,
  computeAndUpsertBaselines,
  checkDailyCap,
} from '@/lib/golden-tests/orchestrator';
import { runScenario } from '@/lib/golden-tests/runner';

const MAX_SCENARIOS_PER_INVOCATION = 3;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cap = await checkDailyCap();
  if (!cap.within) {
    return NextResponse.json({ processed: 0, reason: 'daily-cap-reached', count: cap.count });
  }

  const processed: string[] = [];

  for (let i = 0; i < MAX_SCENARIOS_PER_INVOCATION; i++) {
    const run = await acquireNextRun();
    if (!run) break;

    if (run.status === 'queued') {
      await markRunStarted(run.id);
    }

    const next = await findNextPendingScenario(run.id);
    if (!next) {
      // No hay más pending → run completo
      await computeAndUpsertBaselines(run.id);
      await markRunCompleted(run.id);
      processed.push(`${run.id}:completed`);
      continue;
    }

    // Correr el escenario
    let result;
    try {
      result = await runScenario(next.scenario, next.version);
    } catch (e) {
      console.error('[worker] runScenario threw', {
        runId: run.id,
        scenario: next.scenario_id,
        e: (e as Error).message,
      });
      result = {
        scenario_id: next.scenario_id,
        version: next.version,
        score: null,
        scenario_passed: false,
        transcript: [],
        judge_output: null,
        duration_ms: 0,
        error: 'meerkat_provider_fail' as const,
        tokens_used: { user: 0, meerkat: 0, judge: 0 },
        cost_usd: 0,
      };
    }

    const supabase = createAdminClient();
    await supabase.from('golden_test_scenario_runs').insert({
      run_id: run.id,
      scenario_id: next.scenario_id,
      meerkat_id: run.meerkat_id,
      version: next.version,
      attempt: next.attempt,
      score: result.score,
      scenario_passed: result.scenario_passed,
      transcript: result.transcript,
      judge_output: result.judge_output,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      error: result.error,
    });

    // Solo incrementamos completed_scenarios si el escenario cuenta (i.e., pertenece a los calibrados)
    // Simple: contar todos por ahora (total_scenarios ya usa calibrados). Si desalineado, el gate lo detecta.
    await bumpCompletedScenarios(run.id);

    processed.push(
      `${run.id}:${next.scenario_id}:v${next.version}:a${next.attempt}:score=${result.score}`,
    );
  }

  console.log('[golden-tests-worker]', { processed });
  return NextResponse.json({ processed: processed.length, runs: processed });
}
