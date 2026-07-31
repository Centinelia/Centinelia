import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { MEERKAT_IDS, type MeerkatId } from '@/lib/golden-tests/types';
import { hashScenarioSet } from '@/lib/golden-tests/hash';
import { computeTotalScenarios } from '@/lib/golden-tests/orchestrator';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const meerkat = body.meerkat_id as string;
  const versions = body.versions as number[];

  if (!MEERKAT_IDS.includes(meerkat as MeerkatId)) {
    return NextResponse.json({ error: `Unknown meerkat: ${meerkat}` }, { status: 400 });
  }
  if (!Array.isArray(versions) || versions.length === 0) {
    return NextResponse.json({ error: 'versions must be non-empty array' }, { status: 400 });
  }

  const meerkatId = meerkat as MeerkatId;
  const versionsInBundle = Object.keys(MEERKAT_CONFIGS[meerkatId] ?? {}).map(Number);
  const invalid = versions.filter(v => !versionsInBundle.includes(v));
  if (invalid.length) return NextResponse.json({ error: `Versions not in bundle: ${invalid.join(',')}` }, { status: 400 });

  const supabase = createAdminClient();

  // Delete baselines for these versions so the new run recomputes them
  await supabase
    .from('golden_test_baselines')
    .delete()
    .eq('meerkat_id', meerkatId)
    .in('version', versions);

  const totalScenarios = computeTotalScenarios(meerkatId, versions);
  const { data: run, error } = await supabase
    .from('golden_test_runs')
    .insert({
      meerkat_id: meerkatId,
      versions,
      trigger: 'manual',
      triggered_by: 'admin@centinelia.mx',
      status: 'queued',
      total_scenarios: totalScenarios,
      scenario_hash: hashScenarioSet(meerkatId),
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, run_id: run.id, meerkat_id: meerkatId, versions, invalidated_baselines: versions });
}
