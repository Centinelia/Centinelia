/**
 * F11 battle test: run the Nox monthly report against a fake "now" so the
 * "prior calendar month" window lands on Aug 2026 (where Pneuma Studio has
 * real activity from the recent battle tests). Verify:
 *   - findNoxAgent no longer errors (dropped-column fix)
 *   - metrics get collected
 *   - Sonnet summary is generated
 *   - email is dispatched to client_email
 *   - nox_monthly_reports row inserts with unique (portal_email, month_key)
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { runNoxMonthlyReport } from '../../src/lib/ops/nox-monthly-report';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Fake "now" = Sept 1 2026 → prior month = Aug 2026 (has real activity)
  const fakeNow = new Date('2026-09-01T10:00:00Z');

  const before = (await s.from('nox_monthly_reports').select('id', { count: 'exact', head: true })).count ?? 0;
  console.log(`nox_monthly_reports rows before: ${before}`);
  console.log(`Faking now=${fakeNow.toISOString()} → prior month = Aug 2026\n`);

  const result = await runNoxMonthlyReport(fakeNow);
  console.log('\n--- RESULT ---');
  console.log(JSON.stringify(result, null, 2));

  const { data: after } = await s
    .from('nox_monthly_reports')
    .select('id, portal_email, month_key, sent_to, summary, metrics')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n--- Recent nox_monthly_reports rows ---');
  for (const r of after ?? []) {
    console.log(`  ${r.portal_email} | month ${r.month_key} → ${r.sent_to}`);
    console.log(`    summary head: ${String(r.summary).slice(0, 140)}…`);
    console.log(`    calls: ${(r.metrics as any)?.calls?.total} | tasks completed: ${(r.metrics as any)?.tasks?.completed}`);
  }
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
