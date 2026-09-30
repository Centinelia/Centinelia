import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('tool_call_dedup')
    .delete({ count: 'exact' })
    .lt('expires_at', cutoff);

  if (error) {
    console.error('[dedup-cleanup] error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log('[dedup-cleanup] deleted rows:', count);
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
