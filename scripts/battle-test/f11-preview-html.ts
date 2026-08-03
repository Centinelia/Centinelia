/**
 * Preview the rendered email HTML for F11's monthly report. Runs the full
 * report flow (which persists the row + attempts sendEmail), then reads the
 * fresh row back from DB and renders locally so we can inspect the HTML in
 * a browser without touching the mailbox again.
 */
import { loadEnv } from './_env';
loadEnv();

import { writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Clear prior rows so we generate a fresh one with the new prompt
  await s.from('nox_monthly_reports').delete().eq('portal_email', 'studio@pneumastudio.mx');
  console.log('Cleared prior nox_monthly_reports rows for pneumastudio.');

  const { runNoxMonthlyReport, renderMonthlyEmailHtml } = await import('../../src/lib/ops/nox-monthly-report');
  const result = await runNoxMonthlyReport(new Date('2026-09-01T10:00:00Z'));
  console.log('\nRun result:', result);

  const { data: row } = await s
    .from('nox_monthly_reports')
    .select('portal_email, month_key, summary, metrics, sent_to')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .single();
  if (!row) { console.error('No row generated'); process.exit(1); }

  console.log('\n--- SUMMARY (raw markdown from Sonnet) ---');
  console.log(row.summary);

  const html = renderMonthlyEmailHtml({
    noxName:      'Nox',
    businessName: 'Pneuma Studio',
    monthLabel:   'agosto de 2026',
    metrics:      row.metrics as any,
    summary:      row.summary as string,
  });

  writeFileSync('nox-monthly-preview.html', html, 'utf8');
  console.log(`\nWrote nox-monthly-preview.html (${html.length} chars). Open it in a browser.`);
}
main().catch(err => { console.error('FAIL:', err); process.exit(1); });
