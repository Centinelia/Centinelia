import { NextRequest, NextResponse } from 'next/server';
import { pushConversationalPromptsToAllAgents } from '@/lib/vapi/sync';
import { verifyCronAuth, timingSafeCompareStrings } from '@/lib/auth/cron-auth';

// Pushes updated global conversational learnings to all active Vapi agents.
// Run manually after activating new learnings, or add to vercel.json when ready:
// { "path": "/api/cron/push-conversational-prompts", "schedule": "0 3 * * 1" }  (Mondays 3 AM UTC)

export async function GET(req: NextRequest) {
  const query    = req.nextUrl.searchParams.get('secret') ?? '';
  const cronOk   = verifyCronAuth(req);
  const adminOk  = (process.env.ADMIN_SECRET  ? timingSafeCompareStrings(query, process.env.ADMIN_SECRET)  : false)
                 || (process.env.CRON_SECRET   ? timingSafeCompareStrings(query, process.env.CRON_SECRET)   : false);
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { synced, errors } = await pushConversationalPromptsToAllAgents();
  return NextResponse.json({ ok: true, synced, errors });
}
