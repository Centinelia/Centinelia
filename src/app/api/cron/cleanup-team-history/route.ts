import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { estimateTokens } from '@/lib/voice/team-context';

export const dynamic = 'force-dynamic';

// Token budget per (agent_id, caller_number) pair before pruning oldest calls.
const TOKEN_BUDGET = 80_000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Load all agents that have team_numbers configured
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, team_numbers')
    .not('team_numbers', 'is', null);

  let totalDeleted = 0;

  for (const agent of agents ?? []) {
    const teamNumbers = ((agent.team_numbers as { number: string }[] | null) ?? []).map(t => t.number);
    if (!teamNumbers.length) continue;

    for (const number of teamNumbers) {
      // Fetch all calls for this (agent, number) newest first
      const { data: calls } = await supabase
        .from('voice_calls')
        .select('id, summary, created_at')
        .eq('agent_id', agent.id)
        .eq('caller_number', number)
        .order('created_at', { ascending: false });

      if (!calls?.length) continue;

      let usedTokens = 0;
      const toDelete: string[] = [];

      for (const call of calls) {
        const summary = (call.summary as string | null) ?? '';
        const cost    = estimateTokens(summary);

        if (usedTokens + cost > TOKEN_BUDGET) {
          toDelete.push(call.id as string);
        } else {
          usedTokens += cost;
        }
      }

      if (!toDelete.length) continue;

      // Nullify summaries of old calls rather than deleting records
      // (preserves call logs, just frees context budget)
      await supabase
        .from('voice_calls')
        .update({ summary: null, transcript: null })
        .in('id', toDelete);

      totalDeleted += toDelete.length;
    }
  }

  return NextResponse.json({ ok: true, cleared: totalDeleted });
}
