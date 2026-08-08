/**
 * Trigger event-driven para el golden-tests-worker.
 * No aplica el gate por org (es admin/interno, no per-cliente).
 *
 * Cada invocación del worker procesa MAX_SCENARIOS_PER_INVOCATION (3) escenarios,
 * así que este trigger solo elimina la latencia inicial (~5min hasta el próximo
 * tick del cron). Runs largos siguen necesitando el cron para los batches
 * subsecuentes.
 */
import { after } from 'next/server';

async function runQuiet(reason: string): Promise<void> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const r = await fetch(`${appUrl}/api/cron/golden-tests-worker`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const json = await r.json().catch(() => null);
    console.log(`[golden-tests-trigger] ${reason}:`, json);
  } catch (err) {
    console.error(`[golden-tests-trigger] error (${reason}):`, err instanceof Error ? err.message : err);
  }
}

export function triggerGoldenTestsWorker(reason: string): void {
  try {
    after(() => runQuiet(reason));
  } catch {
    void runQuiet(reason);
  }
}
