export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runValidationForAllAgents } from '@/lib/ops/notion-validator';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await runValidationForAllAgents();
  const totalViolations = summary.reduce((s, r) => s + r.violations, 0);

  return NextResponse.json({ ok: true, agents: summary.length, totalViolations });
}
