// Cron scheduler para tareas programadas de meerkats (agent_tasks con trigger_type='cron').
//
// Ejecuta cada 5 min. Para cada tarea activa cuyo next_run_at ya vencio:
//   1. Intenta adquirir lock via locked_until (evita race conditions con 2 instancias Vercel).
//   2. Verifica que organizations.features.agent_missions_enabled=true.
//   3. Invoca executeTask({ taskId, triggerSource: 'cron' }).
//   4. Recalcula next_run_at con cron-parser exacto + limpia locked_until.
//
// Fix C2: usa cron-parser para next_run_at exacto (mensual/semanal ya no se ejecuta cada 5 min).
// Fix I2: locked_until en agent_tasks previene doble ejecución bajo 2 instancias simultáneas.
//
// Auth: Bearer CRON_SECRET (mismo patrón que todos los cron routes).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { executeTask } from '@/lib/agent-tasks/executor';
import { CronExpressionParser } from 'cron-parser';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const nowIso = new Date().toISOString();
  // Lock TTL: 6 minutos (> cadencia de 5 min) para evitar solapamiento entre ticks.
  const lockUntilIso = new Date(Date.now() + 6 * 60_000).toISOString();

  // Obtener tareas cron activas con next_run_at vencido y sin lock activo.
  // Fix I2: filtrar tareas con locked_until > now (otra instancia ya las tomó).
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
    .lte('trigger_config->>next_run_at', nowIso)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`);

  if (queryError) {
    console.error('[agent-tasks-scheduler] Error al consultar tareas:', queryError.message);
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const tasks = dueTasks ?? [];

  const executed: string[]  = [];
  const skippedFlagOff: string[] = [];
  const skippedLocked: string[] = [];
  const errors: { taskId: string; error: string }[] = [];

  for (const task of tasks) {
    // Intentar adquirir lock: UPDATE condicional WHERE locked_until IS NULL OR < now().
    // Fix I2: si otra instancia ya adquirió el lock, nos saltamos esta tarea.
    const { data: lockData } = await supabase
      .from('agent_tasks')
      .update({ locked_until: lockUntilIso })
      .eq('id', task.id)
      .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
      .select('id');
    const lockCount = lockData?.length ?? 0;

    if (!lockCount || lockCount === 0) {
      // Otra instancia ya adquirió el lock
      skippedLocked.push(task.id as string);
      continue;
    }

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
      // Limpiar lock para que el scheduler no quede bloqueado indefinidamente
      await supabase.from('agent_tasks').update({ locked_until: null }).eq('id', task.id);
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

    // Recalcular next_run_at exacto con cron-parser + limpiar locked_until.
    // Fix C2: calcula el siguiente disparo real según la expresión cron.
    const triggerConfig = (task.trigger_config ?? {}) as Record<string, unknown>;
    const cronExpr = triggerConfig.cron as string | undefined;
    const timezone = triggerConfig.timezone as string | undefined;
    let nextRunAt: string;

    try {
      if (!cronExpr) throw new Error('cron expression missing');
      const interval = CronExpressionParser.parse(cronExpr, {
        tz: timezone ?? 'America/Monterrey',
        currentDate: new Date(),
      });
      nextRunAt = interval.next().toISOString() ?? new Date(Date.now() + 60_000).toISOString();
    } catch (cronErr) {
      // Cron malformado en DB: desactivar la tarea y loggear error; no crashear el scheduler.
      const msg = cronErr instanceof Error ? cronErr.message : String(cronErr);
      console.error(
        `[agent-tasks-scheduler] Cron expression inválida en DB para task ${task.id as string}. Desactivando. Error: ${msg}`,
      );
      await supabase
        .from('agent_tasks')
        .update({ active: false, locked_until: null })
        .eq('id', task.id);
      errors.push({ taskId: task.id as string, error: `cron inválido en DB: ${msg}` });
      continue;
    }

    const { error: updateError } = await supabase
      .from('agent_tasks')
      .update({ trigger_config: { ...triggerConfig, next_run_at: nextRunAt }, locked_until: null })
      .eq('id', task.id);

    if (updateError) {
      console.warn('[agent-tasks-scheduler] No se pudo actualizar next_run_at para', task.id, updateError.message);
    }
  }

  return NextResponse.json({
    executed:           executed.length,
    skipped_flag_off:   skippedFlagOff.length,
    skipped_locked:     skippedLocked.length,
    errors,
    detail: {
      executed_ids:       executed,
      skipped_flag_off_ids: skippedFlagOff,
      skipped_locked_ids: skippedLocked,
    },
  });
}
