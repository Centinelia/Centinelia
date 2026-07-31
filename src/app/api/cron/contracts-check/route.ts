export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { checkExpiringContracts } from '@/lib/ops/contracts-monitor';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { alerted } = await checkExpiringContracts();
  return NextResponse.json({ ok: true, alerted });
}
