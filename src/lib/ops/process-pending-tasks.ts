/**
 * Núcleo compartido entre el cron horario y el trigger event-driven.
 * Extraído de /api/cron/process-tasks/route.ts para poder invocarse
 * inline desde approve-plan, edit-plan, o cualquier otro punto donde
 * nace una tarea en estado 'pending'.
 *
 * Concurrencia: el atomic claim (UPDATE ... WHERE status='pending')
 * garantiza que múltiples invocaciones simultáneas no doble-procesen.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { executeTask, type AgentInfo } from '@/lib/ops/task-executor';
import { transitionAgentTask } from '@/lib/state-machines/agent-task';

export interface ProcessTasksResult {
  processed: number;
  succeeded: number;
  failed:    number;
}

export async function processPendingTasks(limit: number = 10): Promise<ProcessTasksResult> {
  const supabase = createAdminClient();

  const { data: pendingTasks } = await supabase
    .from('agent_tasks')
    .select('id, portal_email, title, description, assigned_to, created_by, source_context')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!pendingTasks?.length) return { processed: 0, succeeded: 0, failed: 0 };

  const agentIds = new Set<string>();
  for (const t of pendingTasks) {
    if (t.assigned_to) agentIds.add(t.assigned_to);
    if (t.created_by)  agentIds.add(t.created_by);
  }

  const { data: agentRows } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, role_knowledge_base, business_name, portal_email')
    .in('id', [...agentIds]);

  const agentMap = new Map<string, AgentInfo>();
  for (const a of agentRows ?? []) agentMap.set(a.id, a as AgentInfo);

  let succeeded = 0;
  let failed    = 0;

  for (const task of pendingTasks) {
    const { data: claimed } = await supabase
      .from('agent_tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .single();

    if (!claimed) continue;

    void supabase.from('task_state_transitions').insert({
      task_id:     task.id,
      from_status: 'pending',
      to_status:   'in_progress',
      actor:       'cron',
      reason:      'cron_pickup',
      metadata:    { title: task.title },
    });

    const targetAgent = task.assigned_to ? agentMap.get(task.assigned_to) ?? null : null;
    const callerAgent = task.created_by  ? agentMap.get(task.created_by)  ?? null : null;

    if (!targetAgent) {
      await transitionAgentTask({
        supabase, taskId: task.id,
        toStatus: 'failed',
        actor:    'cron',
        reason:   'assigned_agent_not_found',
        metadata: { assigned_to: task.assigned_to },
        extraFields: { result: 'Empleado asignado no encontrado.' },
      });
      failed++;
      continue;
    }

    const contexto = [task.description, task.source_context].filter(Boolean).join('\n').slice(0, 800) || null;

    const result = await executeTask({
      taskId:      task.id,
      targetAgent,
      callerAgent,
      tarea:       task.title,
      contexto,
    });

    if (result.success) succeeded++;
    else failed++;
  }

  return { processed: pendingTasks.length, succeeded, failed };
}
