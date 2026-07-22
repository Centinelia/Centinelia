export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeTask, type AgentInfo } from '@/lib/ops/task-executor';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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

  const { data: agentRows } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, knowledge_base, role_knowledge_base, business_name, portal_email')
    .in('id', [...agentIds]);

  const agentMap = new Map<string, AgentInfo>();
  for (const a of agentRows ?? []) agentMap.set(a.id, a as AgentInfo);

  let succeeded = 0;
  let failed    = 0;

  for (const task of pendingTasks) {
    // Atomic claim: only proceed if still pending (guards against concurrent cron runs)
    const { data: claimed } = await supabase
      .from('agent_tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .single();

    if (!claimed) continue;

    const targetAgent = task.assigned_to ? agentMap.get(task.assigned_to) ?? null : null;
    const callerAgent = task.created_by  ? agentMap.get(task.created_by)  ?? null : null;

    if (!targetAgent) {
      await supabase
        .from('agent_tasks')
        .update({ status: 'failed', result: 'Empleado asignado no encontrado.' })
        .eq('id', task.id);
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
