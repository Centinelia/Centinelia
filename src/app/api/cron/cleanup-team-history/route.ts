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

    // Fix N+1 2026-08-10: antes había un triple loop (per agent × per number)
    // haciendo 1 query cada iteración. Con 5 agentes × 5 números = 25 queries
    // por org. Ahora una sola query trae todo y agrupamos en memoria.
    const { data: allCalls } = await supabase
      .from('voice_calls')
      .select('id, agent_id, caller_number, summary, created_at')
      .in('agent_id', agentIds)
      .in('caller_number', numbers)
      .order('created_at', { ascending: false });

    if (!allCalls?.length) continue;

    // Agrupar por (agent_id, caller_number) para aplicar el budget por par.
    const groups = new Map<string, Array<{ id: string; summary: string | null }>>();
    for (const c of allCalls) {
      const key = `${c.agent_id}::${c.caller_number}`;
      const arr = groups.get(key) ?? [];
      arr.push({ id: c.id as string, summary: (c.summary as string | null) ?? null });
      groups.set(key, arr);
    }

    const toDelete: string[] = [];
    for (const calls of groups.values()) {
      let usedTokens = 0;
      for (const call of calls) {
        const cost = estimateTokens(call.summary ?? '');
        if (usedTokens + cost > TOKEN_BUDGET) {
          toDelete.push(call.id);
        } else {
          usedTokens += cost;
        }
      }
    }

    if (!toDelete.length) continue;

    await supabase
      .from('voice_calls')
      .update({ summary: null, transcript: null })
      .in('id', toDelete);

    totalDeleted += toDelete.length;
  }

  return NextResponse.json({ ok: true, cleared: totalDeleted });
}
