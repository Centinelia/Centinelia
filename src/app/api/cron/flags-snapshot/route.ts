export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashBucket } from '@/lib/feature-flags/evaluator';
import type { FlagRow, FlagCounts } from '@/lib/feature-flags/types';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: flags, error: flagErr } = await supabase.from('feature_flags').select('*');
  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 });

  const { data: orgs, error: orgErr } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .not('portal_email', 'is', null);
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  const uniqueEmails = Array.from(new Set((orgs ?? []).map(o => o.portal_email as string)));
  const today = new Date().toISOString().slice(0, 10);

  let inserted = 0;
  for (const flag of (flags ?? []) as FlagRow[]) {
    const counts: FlagCounts = { orgs_on: 0, orgs_off: 0, orgs_via_hash: 0, orgs_via_allowlist: 0, orgs_via_denylist: 0 };
    for (const email of uniqueEmails) {
      if (flag.killed) { counts.orgs_off++; continue; }
      if (flag.denylist.includes(email)) { counts.orgs_off++; counts.orgs_via_denylist++; continue; }
      if (flag.allowlist.includes(email)) { counts.orgs_on++; counts.orgs_via_allowlist++; continue; }
      counts.orgs_via_hash++;
      const bucket = hashBucket(email, flag.flag_key);
      if (bucket < flag.rollout_pct) counts.orgs_on++;
      else counts.orgs_off++;
    }
    const { error: upErr } = await supabase
      .from('feature_flag_daily_snapshots')
      .upsert({ flag_key: flag.flag_key, day: today, counts }, { onConflict: 'flag_key,day' });
    if (upErr) console.error('[flags-snapshot] upsert error', { flag: flag.flag_key, error: upErr.message });
    else inserted++;
  }

  return NextResponse.json({ ok: true, flags_processed: (flags ?? []).length, snapshots_written: inserted, orgs_evaluated: uniqueEmails.length });
}
