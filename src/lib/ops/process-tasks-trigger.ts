/**
 * Trigger event-driven para procesar tareas pendientes sin esperar al cron horario.
 *
 * Uso: llamar desde puntos donde nace una tarea 'pending' (approve-plan,
 * edit-plan, o cualquier futura ruta que promueva awaiting_plan_approval → pending).
 *
 * Concurrencia: el atomic claim dentro de processPendingTasks garantiza que
 * múltiples triggers simultáneos no doble-procesen, por eso no aplicamos
 * debounce agresivo — solo protegemos el `after()` fuera de request context.
 */
import { after } from 'next/server';
import { processPendingTasks } from '@/lib/ops/process-pending-tasks';

async function runQuiet(reason: string): Promise<void> {
  try {
    const result = await processPendingTasks();
    if (result.processed > 0) {
      console.log(`[process-tasks-trigger] ${reason}:`, result);
    }
  } catch (err) {
    console.error(`[process-tasks-trigger] error (${reason}):`, err instanceof Error ? err.message : err);
  }
}

export function triggerProcessTasks(reason: string): void {
  try {
    after(() => runQuiet(reason));
  } catch {
    void runQuiet(reason);
  }
}
