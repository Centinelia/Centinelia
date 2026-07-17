import { NextRequest, NextResponse } from 'next/server';
import { pushConversationalPromptsToAllAgents } from '@/lib/vapi/sync';

// Pushes updated global conversational learnings to all active Vapi agents.
// Run manually after activating new learnings, or add to vercel.json when ready:
// { "path": "/api/cron/push-conversational-prompts", "schedule": "0 3 * * 1" }  (Mondays 3 AM UTC)

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { synced, errors } = await pushConversationalPromptsToAllAgents();
  return NextResponse.json({ ok: true, synced, errors });
}
