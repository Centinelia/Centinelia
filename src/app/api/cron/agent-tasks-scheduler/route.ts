// Cron scheduler para tareas programadas de meerkats (agent_tasks con trigger_type='cron').
//
// Ejecuta cada 5 min. Para cada tarea activa cuyo next_run_at ya vencio:
//   1. Verifica que organizations.features.agent_missions_enabled=true.
//   2. Invoca executeTask({ taskId, triggerSource: 'cron' }).
//   3. Recalcula next_run_at = ahora + 1 min (approximación; ver concern sobre cron-parser).
//
// Auth: Bearer CRON_SECRET (mismo patrón que todos los cron routes).
//
// Review Focus #3: Cron scheduler NO debe ejecutar tarea si agent_missions_enabled=false.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeTask } from '@/lib/agent-tasks/executor';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Obtener tareas cron activas con next_run_at vencido.
  // Se hace join manual via portal_email a organizations para el feature flag.
  const { data: dueTasks, error: queryError } = await supabase
    .from('agent_tasks')
    .select(`
      id,
      slug,
      portal_email,
      owner_agent_id,
      trigger_config
    `)
    .eq('trigger_type', 'cron')
    .eq('active', true)
    .lte('trigger_config->>next_run_at', new Date().toISOString());

  if (queryError) {
    console.error('[agent-tasks-scheduler] Error al consultar tareas:', queryError.message);
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const tasks = dueTasks ?? [];

  const executed: string[]  = [];
  const skippedFlagOff: string[] = [];
  const errors: { taskId: string; error: string }[] = [];

  for (const task of tasks) {
    // Verificar feature flag agent_missions_enabled en el org
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('features')
      .eq('portal_email', task.portal_email as string)
      .maybeSingle();

    const features = (orgRow?.features ?? {}) as Record<string, unknown>;
    const missionEnabled = features.agent_missions_enabled === true;

    if (!missionEnabled) {
      skippedFlagOff.push(task.id as string);
      continue;
    }

    try {
      // Ejecutar secuencial, no paralelo (evitar sobrecarga del pool)
      await executeTask({ taskId: task.id as string, triggerSource: 'cron' });
      executed.push(task.id as string);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[agent-tasks-scheduler] Error ejecutando tarea', task.id, msg);
      errors.push({ taskId: task.id as string, error: msg });
    }

    // Recalcular next_run_at después de ejecutar (o de fallar).
    // Nota: sin cron-parser, calculamos el próximo intervalo como ahora + 5 min.
    // Para produción exacta, agregar cron-parser a dependencias.
    const triggerConfig = (task.trigger_config ?? {}) as Record<string, unknown>;
    const nextRunAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { error: updateError } = await supabase
      .from('agent_tasks')
      .update({ trigger_config: { ...triggerConfig, next_run_at: nextRunAt } })
      .eq('id', task.id);

    if (updateError) {
      console.warn('[agent-tasks-scheduler] No se pudo actualizar next_run_at para', task.id, updateError.message);
    }
  }

  return NextResponse.json({
    executed: executed.length,
    skipped_flag_off: skippedFlagOff.length,
    errors,
    detail: {
      executed_ids:  executed,
      skipped_ids:   skippedFlagOff,
    },
  });
}
