export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { runNoxMonthlyReport } from '@/lib/ops/nox-monthly-report';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runNoxMonthlyReport();
  return NextResponse.json({ ok: true, ...result });
}
