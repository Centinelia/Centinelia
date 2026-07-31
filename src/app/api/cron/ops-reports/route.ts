export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runReport } from '@/lib/ops/report-generator';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date().toISOString();

  const { data: due } = await supabase
    .from('ops_reports')
    .select('id, name, agent_id')
    .eq('active', true)
    .lte('next_run_at', now);

  if (!due?.length) return NextResponse.json({ ok: true, ran: 0 });

  const results = await Promise.allSettled(due.map(r => runReport(r.id as string)));

  const ok      = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
  const failed  = results.length - ok;

  return NextResponse.json({ ok: true, ran: ok, failed });
}
