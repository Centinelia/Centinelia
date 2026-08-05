export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeTask, type AgentInfo } from '@/lib/ops/task-executor';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { transitionAgentTask } from '@/lib/state-machines/agent-task';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: pendingTasks } = await supabase
    .from('agent_tasks')
    .select('id, portal_email, title, description, assigned_to, created_by, source_context')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  if (!pendingTasks?.length) {
    return NextResponse.json({ ok: true, processed: 0, succeeded: 0, failed: 0 });
  }

  // Collect all agent IDs to fetch in one query
  const agentIds = new Set<string>();
  for (const t of pendingTasks) {
    if (t.assigned_to) agentIds.add(t.assigned_to);
    if (t.created_by)  agentIds.add(t.created_by);
  }

  // knowledge_base lives on `organizations` now (dropped from voice_agents in e372013).
  // We stub it as null here; task-executor re-hydrates it org-wide when it runs.
  const { data: agentRows } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, role_knowledge_base, business_name, portal_email')
    .in('id', [...agentIds]);

  const agentMap = new Map<string, AgentInfo>();
  for (const a of agentRows ?? []) agentMap.set(a.id, a as AgentInfo);

  let succeeded = 0;
  let failed    = 0;

  for (const task of pendingTasks) {
    // Atomic claim: only proceed if still pending (guards against concurrent cron runs)
    // Nota: usamos UPDATE con .eq('status', 'pending') para conservar la garantía
    // atómica que impide double-claim. La transición se registra manualmente
    // después porque transitionAgentTask hace read-then-write (no atómico contra
    // concurrent crons).
    const { data: claimed } = await supabase
      .from('agent_tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .single();

    if (!claimed) continue;

    // Registrar la transición para el historial (fire-and-forget, no bloquea).
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

  return NextResponse.json({ ok: true, processed: pendingTasks.length, succeeded, failed });
}
