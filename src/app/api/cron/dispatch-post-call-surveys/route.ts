export const dynamic     = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { runPostCallSurveyDispatch } from '@/lib/ops/survey-dispatch';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runPostCallSurveyDispatch();
  return NextResponse.json({ ok: true, ...result });
}
