import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const doneCutoff   = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const failedCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { count: doneDeleted } = await supabase
    .from('email_send_jobs')
    .delete({ count: 'exact' })
    .eq('status', 'done')
    .lt('delivered_at', doneCutoff);

  const { count: failedDeleted } = await supabase
    .from('email_send_jobs')
    .delete({ count: 'exact' })
    .in('status', ['failed', 'dead'])
    .lt('failed_at', failedCutoff);

  console.log('[email-jobs-cleanup] deleted:', { done: doneDeleted, failed: failedDeleted });
  return NextResponse.json({ ok: true, done_deleted: doneDeleted ?? 0, failed_deleted: failedDeleted ?? 0 });
}
