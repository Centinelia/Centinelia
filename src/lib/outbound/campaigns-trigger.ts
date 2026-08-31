/**
 * Trigger event-driven para campañas outbound. Gate por org flag.
 *
 * A diferencia del contacts-trigger, este NO extrae el runner del cron
 * porque la lógica del cron (rate limiting, capability gate, contact
 * filtering) es substancial. En su lugar, dispara el cron endpoint
 * internamente via fetch — solo se usa cuando se crea una campaña
 * lista para correr, así que el hop extra es aceptable.
 */
import { after } from 'next/server';
import { isInstantProcessingEnabled } from '@/lib/ops/instant-processing';

async function runQuiet(reason: string, agentId: string | null | undefined): Promise<void> {
  try {
    if (!(await isInstantProcessingEnabled(agentId))) {
      console.log(`[campaigns-trigger] skipped (${reason}) — agent opted out`);
      return;
    }
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const r = await fetch(`${appUrl}/api/cron/outbound-campaigns`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const json = await r.json().catch(() => null);
    console.log(`[campaigns-trigger] ${reason}:`, json);
  } catch (err) {
    console.error(`[campaigns-trigger] error (${reason}):`, err instanceof Error ? err.message : err);
  }
}

export function triggerOutboundCampaigns(reason: string, agentId: string | null | undefined): void {
  try {
    after(() => runQuiet(reason, agentId));
  } catch {
    void runQuiet(reason, agentId);
  }
}
