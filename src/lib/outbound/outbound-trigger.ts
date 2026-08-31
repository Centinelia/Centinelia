/**
 * Trigger event-driven para procesar contactos outbound cuyo scheduled_at
 * ya venció. Gate por voice_agents.instant_processing_enabled del agente
 * dueño del contacto que dispara el trigger.
 *
 * Nota: processDueOutboundContacts sigue escaneando todos los agentes; el
 * gate per-agent aquí solo evita disparar el barrido cuando el agente que
 * generó el evento opted-out. Un follow-up puede filtrar per-agent dentro
 * del propio processDueOutboundContacts.
 */
import { after } from 'next/server';
import { processDueOutboundContacts } from '@/lib/outbound/process-due-contacts';
import { isInstantProcessingEnabled } from '@/lib/ops/instant-processing';

async function runQuiet(reason: string, agentId: string | null | undefined): Promise<void> {
  try {
    if (!(await isInstantProcessingEnabled(agentId))) {
      console.log(`[outbound-trigger] skipped (${reason}) — agent opted out of instant processing`);
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

export function triggerOutboundContacts(reason: string, agentId: string | null | undefined): void {
  try {
    after(() => runQuiet(reason, agentId));
  } catch {
    void runQuiet(reason, agentId);
  }
}
