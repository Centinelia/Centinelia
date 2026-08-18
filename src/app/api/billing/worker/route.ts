/**
 * GET /api/billing/worker
 *
 * Cron endpoint (runs every minute). Claims one pending billing job via
 * dequeueAndRun() and executes its kind-specific handler.
 *
 * Auth: Bearer CRON_SECRET via Authorization header (same pattern as all
 *       other cron endpoints — see src/lib/auth/cron-auth.ts).
 *
 * Response: { ok: true, processed: 0|1 }
 */

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { dequeueAndRun } from '@/lib/billing/employee/queue';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dequeueAndRun();
    return NextResponse.json({ ok: true, processed: result.processed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[billing/worker] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
