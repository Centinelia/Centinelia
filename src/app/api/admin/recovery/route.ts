import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { RECOVERY_RULES } from '@/lib/recovery/rules';

export const dynamic = 'force-dynamic';

/** Info de reglas + count actual de items stuck (dry run, no ejecuta). */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runNow = req.nextUrl.searchParams.get('run') === '1';

  if (runNow) {
    const { executeAllRecoveryRules } = await import('@/lib/recovery/rules');
    const supabase = createAdminClient();
    const summary  = await executeAllRecoveryRules(supabase);
    return NextResponse.json({ mode: 'executed', ...summary, ranAt: new Date().toISOString() });
  }

  // Dry run — cuántos items caerían en cada regla
  const supabase = createAdminClient();
  const rules = await Promise.all(RECOVERY_RULES.map(async rule => {
    const cutoff = new Date(Date.now() - rule.stuckAfterMinutes * 60_000).toISOString();
    let q = supabase
      .from(rule.sourceTable)
      .select('id', { count: 'exact', head: true })
      .eq(rule.statusColumn, rule.stuckStatus)
      .lt(rule.ageColumn, cutoff);
    for (const f of rule.extraFilters ?? []) {
      if (f.op === 'eq') q = q.eq(f.column, f.value);
      else if (f.op === 'is') q = q.is(f.column, f.value as null);
    }
    const { count } = await q;
    return {
      id:                rule.id,
      description:       rule.description,
      source_table:      rule.sourceTable,
      stuck_status:      rule.stuckStatus,
      stuck_after_min:   rule.stuckAfterMinutes,
      would_recover_now: count ?? 0,
    };
  }));

  return NextResponse.json({ mode: 'dry_run', rules });
}
