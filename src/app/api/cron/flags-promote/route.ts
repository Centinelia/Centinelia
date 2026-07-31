export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAutoPromote } from '@/lib/feature-flags/auto-promote';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runAutoPromote(supabase);
  return NextResponse.json({ ok: true, ...result });
}
