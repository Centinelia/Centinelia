export const dynamic    = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { runNoxMonitor } from '@/lib/ops/nox-coordinator';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runNoxMonitor();
  return NextResponse.json({ ok: true, ...result });
}
