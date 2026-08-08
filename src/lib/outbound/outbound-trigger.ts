/**
 * Trigger event-driven para procesar contactos outbound cuyo scheduled_at
 * ya venció. Gate por organizations.instant_processing_enabled.
 */
import { after } from 'next/server';
import { processDueOutboundContacts } from '@/lib/outbound/process-due-contacts';
import { isInstantProcessingEnabled } from '@/lib/ops/instant-processing';

async function runQuiet(reason: string, portalEmail: string | null | undefined): Promise<void> {
  try {
    if (!(await isInstantProcessingEnabled(portalEmail))) {
      console.log(`[outbound-trigger] skipped (${reason}) — org opted out of instant processing`);
      return;
    }
    const result = await processDueOutboundContacts();
    if (result.triggered > 0 || result.failed > 0) {
      console.log(`[outbound-trigger] ${reason}:`, result);
    }
  } catch (err) {
    console.error(`[outbound-trigger] error (${reason}):`, err instanceof Error ? err.message : err);
  }
}

export function triggerOutboundContacts(reason: string, portalEmail: string | null | undefined): void {
  try {
    after(() => runQuiet(reason, portalEmail));
  } catch {
    void runQuiet(reason, portalEmail);
  }
}
