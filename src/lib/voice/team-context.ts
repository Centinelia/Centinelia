import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface TeamNumber {
  number: string;
  name?:  string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Loads relevant call history for team numbers within a token budget.
// Skips unanswered calls and calls with no summary — nothing worth remembering.
// Caps at 5 calls per number so one frequent caller can't monopolize the budget.
export async function loadTeamCallContext(
  agentIds:    string[],
  teamNumbers: TeamNumber[],
  supabase:    SupabaseClient,
  budgetTokens = 12_000,
): Promise<string> {
  if (!teamNumbers.length || !agentIds.length) return '';

  const numbers = teamNumbers.map(t => t.number);
  const nameMap = Object.fromEntries(teamNumbers.map(t => [t.number, t.name ?? t.number]));

  const { data: calls } = await supabase
    .from('voice_calls')
    .select('caller_number, duration_seconds, summary, outcome, created_at')
    .in('agent_id', agentIds)
    .in('caller_number', numbers)
    .neq('outcome', 'unanswered')
    .not('summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!calls?.length) return '';

  const countPerNumber: Record<string, number> = {};
  const blocks: string[] = [];
  let usedTokens = 0;

  for (const call of calls) {
    const num = call.caller_number as string;
    countPerNumber[num] = (countPerNumber[num] ?? 0) + 1;
    if (countPerNumber[num] > 5) continue;

    const label   = nameMap[num] ?? num;
    const date    = new Date(call.created_at as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    const mins    = Math.round(((call.duration_seconds as number) || 0) / 60);
    const summary = (call.summary as string) ?? '';
    const outcome = (call.outcome as string) ?? 'otro';

    const line = `- ${date} | ${label} (${num}) | ${mins}min | ${outcome} | ${summary}`;
    const cost = estimateTokens(line);

    if (usedTokens + cost > budgetTokens) break;
    blocks.push(line);
    usedTokens += cost;
  }

  if (!blocks.length) return '';
  return `# Historial de llamadas del equipo\n${blocks.join('\n')}`;
}
