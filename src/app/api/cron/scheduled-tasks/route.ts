export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

function getNextRun(frequency: string, schedule: Record<string, number>, timezone = 'America/Monterrey'): Date {
  const now    = new Date();
  const tzNow  = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offset = now.getTime() - tzNow.getTime();
  const hour   = schedule.hour ?? 8;

  if (frequency === 'daily') {
    const c = new Date(tzNow);
    c.setDate(c.getDate() + 1);
    c.setHours(hour, 0, 0, 0);
    return new Date(c.getTime() + offset);
  }
  if (frequency === 'weekly') {
    const c      = new Date(tzNow);
    const target = schedule.day_of_week ?? 1;
    const diff   = (target - tzNow.getDay() + 7) % 7 || 7;
    c.setDate(c.getDate() + diff);
    c.setHours(hour, 0, 0, 0);
    return new Date(c.getTime() + offset);
  }
  const c = new Date(tzNow);
  c.setMonth(c.getMonth() + 1);
  c.setDate(schedule.day_of_month ?? 1);
  c.setHours(hour, 0, 0, 0);
  return new Date(c.getTime() + offset);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date().toISOString();

  const { data: due } = await supabase
    .from('scheduled_agent_tasks')
    .select('*')
    .eq('active', true)
    .lte('next_run_at', now);

  if (!due?.length) return NextResponse.json({ ok: true, ran: 0 });

  const results = await Promise.allSettled(due.map(task => runScheduledTask(task, supabase)));

  const ok     = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - ok;

  return NextResponse.json({ ok: true, ran: ok, failed });
}

async function runScheduledTask(
  task: Record<string, unknown>,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const taskId      = task.id as string;
  const agentId     = task.agent_id as string;
  const portalEmail = task.portal_email as string;
  const description = task.description as string;
  const criteria    = task.success_criteria as string | null;
  const maxIter     = task.max_iterations as number ?? 3;

  // Find the orchestrating agent (Nox/coordinator if available)
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, features, timezone')
    .eq('portal_email', portalEmail)
    .eq('active', true);

  if (!agents?.length) {
    await markResult(supabase, taskId, 'failed', 'No hay agentes activos en el portal.', false, task, 'America/Monterrey');
    return;
  }

  // Prefer coordinator (Nox/Niva), fallback to the specific agent_id, then any agent
  const coordinator = agents.find(a => (a.features as Record<string, unknown>)?.is_coordinator === true);
  const target      = agents.find(a => a.id === agentId) ?? coordinator ?? agents[0];
  const tz          = (target.timezone as string | null) ?? 'America/Monterrey';

  // Call delegar-tarea on the target agent's behalf
  try {
    const res = await fetch(`${APP_URL}/api/voice/tools/delegar-tarea?agent_id=${target.id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agente:           agentId !== target.id
          ? (agents.find(a => a.id === agentId)?.agent_name ?? 'agente')
          : (target.agent_name ?? 'agente'),
        tarea:            description,
        contexto:         `Tarea programada automáticamente: ${task.name as string}`,
        success_criteria: criteria ?? undefined,
        max_iterations:   maxIter,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data   = await res.json() as { results?: Array<{ result: string }> };
    const result = data.results?.[0]?.result ?? 'Tarea ejecutada.';
    const met    = criteria ? result.includes('[Criterio cumplido]') : true;
    const status = met ? 'success' : 'partial';

    await markResult(supabase, taskId, status, result, met, task, tz);
  } catch (err) {
    await markResult(supabase, taskId, 'failed', String(err), false, task, tz);
  }
}

async function markResult(
  supabase: ReturnType<typeof createAdminClient>,
  taskId:   string,
  status:   string,
  result:   string,
  goalMet:  boolean,
  task:     Record<string, unknown>,
  timezone  = 'America/Monterrey',
): Promise<void> {
  const nextRun = getNextRun(
    task.frequency as string,
    (task.schedule as Record<string, number>) ?? {},
    timezone,
  );

  await supabase.from('scheduled_agent_tasks').update({
    last_run_at:   new Date().toISOString(),
    next_run_at:   nextRun.toISOString(),
    last_result:   result.slice(0, 500),
    last_status:   status,
    last_goal_met: task.success_criteria ? goalMet : null,
  }).eq('id', taskId);
}
