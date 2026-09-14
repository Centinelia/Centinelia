export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { runNashMonitor } from '@/lib/ops/nash-runner';
import { defineCron } from '@/lib/cron/define-cron';

export const GET = defineCron({
  name:        'nash-monitor',
  maxDuration: 60,
  // Nash es el detector interno — no queremos que dispare alertCronPartialFailure
  // sobre sí mismo. Además, "no encontró incidentes" no es failure.
  silenceAlerts: true,
  handler: async () => {
    const result = await runNashMonitor() as {
      processed?: number;
      total?:     number;
      errors?:    string[];
    } | Record<string, unknown>;

    const total     = (result as { total?: number }).total     ?? 0;
    const processed = (result as { processed?: number }).processed ?? total;
    const errors    = (result as { errors?: string[] }).errors ?? [];

    return {
      expected:  total,
      processed,
      errors,
      metadata:  { ...result },
    };
  },
});
