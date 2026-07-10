export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { checkExpiringContracts } from '@/lib/ops/contracts-monitor';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { alerted } = await checkExpiringContracts();
  return NextResponse.json({ ok: true, alerted });
}
