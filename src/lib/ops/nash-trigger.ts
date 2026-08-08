/**
 * Event-driven trigger para Nash. Reemplaza gasto de cron cada 10 min por
 * corridas oportunistas cuando nace una señal real.
 *
 * - Usa `after()` de Next 16 para no bloquear la request original.
 * - Debounce: si ya corrió hace menos de MIN_INTERVAL_MS, skip (el runner
 *   deduplica por si acaso, pero esto evita gastar tokens en corridas vacías).
 * - Sigue existiendo un cron horario como red de seguridad.
 */
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runNashMonitor } from '@/lib/ops/nash-runner';

const MIN_INTERVAL_MS = 5 * 60 * 1000;

async function runIfNotDebounced(reason: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const cutoff   = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
    const { data } = await supabase
      .from('llm_call_log')
      .select('id')
      .eq('source', 'nash-monitor')
      .gte('created_at', cutoff)
      .limit(1);

    if (data && data.length > 0) {
      console.log(`[nash-trigger] skipped (${reason}) — ran within last 5min`);
      return;
    }

    console.log(`[nash-trigger] firing (${reason})`);
    const result = await runNashMonitor();
    console.log(`[nash-trigger] done (${reason}):`, {
      ok:              result.ok,
      iterations:      result.iterations,
      stopped_because: result.stopped_because,
      skipped_reason:  result.skipped_reason,
    });
  } catch (err) {
    console.error(`[nash-trigger] error (${reason}):`, err instanceof Error ? err.message : err);
  }
}

export function triggerNashMonitor(reason: string): void {
  try {
    after(() => runIfNotDebounced(reason));
  } catch {
    // Fuera de contexto de request (worker sin cabecera Next). Detach best-effort.
    void runIfNotDebounced(reason);
  }
}
