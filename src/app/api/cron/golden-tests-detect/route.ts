export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { checkDailyCap, computeTotalScenarios, N_ATTEMPTS } from '@/lib/golden-tests/orchestrator';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cap = await checkDailyCap();
  if (!cap.within) {
    console.warn('[golden-tests-detect] daily cap reached, pausing new runs', { count: cap.count });
    return NextResponse.json({ paused: true, dailyCount: cap.count });
  }

  const supabase = createAdminClient();
  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const meerkatId of MEERKAT_IDS) {
    const versionsInBundle = Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number);
    if (versionsInBundle.length === 0) {
      skipped.push(`${meerkatId}:no-versions-in-bundle`);
      continue;
    }

    const currentHash = hashScenarioSet(meerkatId);

    const { data: baselines } = await supabase
      .from('golden_test_baselines')
      .select('version, scenario_hash')
      .eq('meerkat_id', meerkatId);

    const knownVersions = new Set((baselines ?? []).map(b => b.version));
    const staleBaselines = (baselines ?? []).filter(b => b.scenario_hash !== currentHash);

    const missing = versionsInBundle.filter(v => !knownVersions.has(v));
    const isStale = staleBaselines.length > 0;

    if (missing.length === 0 && !isStale) {
      skipped.push(`${meerkatId}:up-to-date`);
      continue;
    }

    // Avoid duplicating: skip if there's already a queued/running run for this meerkat
    const { data: existingRun } = await supabase
      .from('golden_test_runs')
      .select('id')
      .eq('meerkat_id', meerkatId)
      .in('status', ['queued', 'running'])
      .limit(1)
      .maybeSingle();

    if (existingRun) {
      skipped.push(`${meerkatId}:run-in-progress:${existingRun.id}`);
      continue;
    }

    // Determinar versiones a correr
    const { data: activeRow } = await supabase
      .from('meerkat_active_versions')
      .select('active_version')
      .eq('meerkat_id', meerkatId)
      .maybeSingle();

    const activeVersion = activeRow?.active_version ?? 1;
    const versionsToRun = Array.from(new Set([
      activeVersion,
      ...missing,
      ...staleBaselines.map(b => b.version),
    ])).filter(v => versionsInBundle.includes(v)).sort();

    if (versionsToRun.length === 0) {
      skipped.push(`${meerkatId}:no-versions-to-run`);
      continue;
    }

    // Si es stale, borrar los baselines viejos afectados (nueva computación tomará su lugar)
    if (isStale) {
      const staleVersions = staleBaselines.map(b => b.version);
      await supabase
        .from('golden_test_baselines')
        .delete()
        .eq('meerkat_id', meerkatId)
        .in('version', staleVersions);
    }

    const totalScenarios = computeTotalScenarios(meerkatId, versionsToRun);
    if (totalScenarios === 0) {
      skipped.push(`${meerkatId}:no-calibrated-scenarios`);
      continue;
    }

    const trigger = missing.length > 0 ? 'auto-new-version' : 'auto-scenario-changed';

    const { data: run, error } = await supabase
      .from('golden_test_runs')
      .insert({
        meerkat_id: meerkatId,
        versions: versionsToRun,
        trigger,
        triggered_by: 'system',
        status: 'queued',
        total_scenarios: totalScenarios,
        scenario_hash: currentHash,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[golden-tests-detect] insert failed', { meerkatId, error: error.message });
      skipped.push(`${meerkatId}:insert-error`);
      continue;
    }

    inserted.push(`${meerkatId}:${run.id}:v[${versionsToRun.join(',')}]:${trigger}`);
  }

  console.log('[golden-tests-detect]', { inserted, skipped });
  return NextResponse.json({ inserted, skipped });
}
