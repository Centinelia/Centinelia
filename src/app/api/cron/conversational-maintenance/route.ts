import { NextRequest, NextResponse } from 'next/server';
import { runConversationalMaintenance } from '@/lib/conversational/maintenance';
import { verifyCronAuth, timingSafeCompareStrings } from '@/lib/auth/cron-auth';

// Corre semanal (domingo 2 AM UTC, antes del push del lunes 3 AM).
// vercel.json: { "path": "/api/cron/conversational-maintenance", "schedule": "0 2 * * 0" }

export async function GET(req: NextRequest) {
  const query   = req.nextUrl.searchParams.get('secret') ?? '';
  const cronOk  = verifyCronAuth(req);
  const adminOk = (process.env.ADMIN_SECRET ? timingSafeCompareStrings(query, process.env.ADMIN_SECRET) : false)
               || (process.env.CRON_SECRET  ? timingSafeCompareStrings(query, process.env.CRON_SECRET)  : false);
  if (!cronOk && !adminOk) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const summary = await runConversationalMaintenance();
  return NextResponse.json({ ok: true, ...summary });
}
