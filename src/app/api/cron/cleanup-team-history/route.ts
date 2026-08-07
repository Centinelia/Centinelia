import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { estimateTokens } from '@/lib/voice/team-context';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import type { DirectoryPerson } from '@/lib/helpdesk/folio';

export const dynamic = 'force-dynamic';

// Token budget per (agent_id, caller_number) pair before pruning oldest calls.
const TOKEN_BUDGET = 80_000;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Directorio unificado por org — expandimos a todos los agentes de esa org.
  const { data: orgs } = await supabase
    .from('organizations')
    .select('portal_email, directory');

  let totalDeleted = 0;

  for (const org of orgs ?? []) {
    const directory = ((org as any).directory ?? []) as DirectoryPerson[];
    const numbers = directory
      .filter(p => p.is_owner || p.is_team)
      .map(p => p.phone)
      .filter(Boolean);
    if (!numbers.length) continue;

    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', (org as any).portal_email);
    const agentIds = (agents ?? []).map(a => a.id as string);
    if (!agentIds.length) continue;

    for (const agentId of agentIds) {
      for (const number of numbers) {
        const { data: calls } = await supabase
          .from('voice_calls')
          .select('id, summary, created_at')
          .eq('agent_id', agentId)
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

        await supabase
          .from('voice_calls')
          .update({ summary: null, transcript: null })
          .in('id', toDelete);

        totalDeleted += toDelete.length;
      }
    }
  }

  return NextResponse.json({ ok: true, cleared: totalDeleted });
}
