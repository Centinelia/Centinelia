import { createAdminClient } from '@/lib/supabase/admin';

export type GoalMetric =
  | 'leads'
  | 'appointments'
  | 'orders'
  | 'calls'
  | 'documentos'
  | 'tareas'
  | 'correos'
  | 'custom';

export interface AgentGoal {
  id: string;
  agent_id: string;
  title: string;
  metric: GoalMetric;
  target: number;
  current: number;
  period: 'week' | 'month';
  active: boolean;
  created_at: string;
}

function periodStart(period: 'week' | 'month'): string {
  const now = new Date();
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

async function computeProgress(
  goal: AgentGoal,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<number> {
  if (goal.metric === 'custom') return goal.current;

  const since = periodStart(goal.period);

  // ── Voice channel ─────────────────────────────────────────────────────────

  if (goal.metric === 'leads') {
    const { count } = await supabase
      .from('leads_voice')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', goal.agent_id)
      .gte('created_at', since);
    return count ?? 0;
  }

  if (goal.metric === 'appointments') {
    const { count } = await supabase
      .from('appointments_voice')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', goal.agent_id)
      .gte('created_at', since);
    return count ?? 0;
  }

  if (goal.metric === 'orders') {
    const { count } = await supabase
      .from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', goal.agent_id)
      .eq('order_created', true)
      .gte('created_at', since);
    return count ?? 0;
  }

  if (goal.metric === 'calls') {
    const { count } = await supabase
      .from('voice_calls')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', goal.agent_id)
      .neq('outcome', 'unanswered')
      .gte('created_at', since);
    return count ?? 0;
  }

  // ── Office channel ────────────────────────────────────────────────────────

  if (goal.metric === 'documentos') {
    const { count } = await supabase
      .from('ops_documents')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', goal.agent_id)
      .gte('created_at', since);
    return count ?? 0;
  }

  if (goal.metric === 'tareas') {
    const { count } = await supabase
      .from('agent_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', goal.agent_id)
      .eq('status', 'completed')
      .gte('created_at', since);
    return count ?? 0;
  }

  if (goal.metric === 'correos') {
    const { count } = await supabase
      .from('ops_inbox')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', goal.agent_id)
      .in('status', ['approved', 'auto_replied'])
      .gte('created_at', since);
    return count ?? 0;
  }

  return 0;
}

export async function getGoalsContext(agentId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data: goals } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('agent_id', agentId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (!goals?.length) return null;

  const lines: string[] = [];
  for (const goal of goals as AgentGoal[]) {
    const progress = await computeProgress(goal, supabase);
    const remaining = Math.max(0, goal.target - progress);
    const periodLabel = goal.period === 'month' ? 'este mes' : 'esta semana';
    const status = remaining === 0 ? 'META ALCANZADA' : `faltan ${remaining}`;
    lines.push(`• ${goal.title} ${periodLabel}: ${progress} de ${goal.target} (${status})`);
  }

  return `METAS DEL PERÍODO:\n${lines.join('\n')}\nUsa estas metas como contexto para priorizar tus acciones. Cuando logres un avance, puedes mencionarlo de forma natural en la conversación.`;
}

export async function getGoalsWithProgress(
  agentId: string,
): Promise<Array<AgentGoal & { progress: number }>> {
  const supabase = createAdminClient();

  const { data: goals } = await supabase
    .from('agent_goals')
    .select('*')
    .eq('agent_id', agentId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (!goals?.length) return [];

  const result: Array<AgentGoal & { progress: number }> = [];
  for (const goal of goals as AgentGoal[]) {
    const progress = await computeProgress(goal, supabase);
    result.push({ ...(goal as AgentGoal), progress });
  }

  return result;
}
