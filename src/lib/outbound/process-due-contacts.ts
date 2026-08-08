/**
 * Compartido entre cron horario (/api/cron/outbound) y el trigger
 * event-driven (lib/outbound/outbound-trigger.ts).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import { transitionOutboundContact } from '@/lib/state-machines/outbound-contact';

export interface OutboundContactsResult {
  triggered: number;
  failed:    number;
}

export async function processDueOutboundContacts(limit: number = 20): Promise<OutboundContactsResult> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: contacts } = await supabase
    .from('outbound_contacts')
    .select('*, voice_agents!inner(id, vapi_agent_id, phone_number, business_name, features, active)')
    .eq('status', 'pending')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now)
    .limit(limit);

  if (!contacts?.length) return { triggered: 0, failed: 0 };

  let triggered = 0;
  let failed    = 0;

  for (const contact of contacts) {
    const agent = (contact as unknown as { voice_agents: { id: string; vapi_agent_id: string | null; phone_number: string | null; business_name: string | null; features: Record<string, unknown> | null; active: boolean } }).voice_agents;
    if (!agent?.active || !agent?.features?.outbound_calls || !agent?.vapi_agent_id) continue;

    // Atomic claim: solo procesa si sigue pending. Bloquea double-processing
    // cuando el trigger corre concurrente con el cron.
    const { data: claimed } = await supabase
      .from('outbound_contacts')
      .update({ status: 'calling' })
      .eq('id', contact.id)
      .eq('status', 'pending')
      .select('id')
      .single();
    if (!claimed) continue;

    try {
      const result = await triggerOutboundCall({
        agent:          agent as never,
        customerNumber: contact.telefono,
        customerName:   contact.nombre ?? undefined,
        motivo:         contact.motivo ?? undefined,
      });

      if (result.ok) {
        triggered++;
        await transitionOutboundContact({
          supabase, contactId: contact.id,
          toStatus: 'calling',
          actor:    'trigger',
          reason:   'due_pickup_outbound',
          metadata: { vapi_call_id: result.callId, agent_id: agent.id },
          soft:     true, // ya lo pusimos en 'calling' arriba (atomic claim)
        });
        await supabase.from('outbound_calls').insert({
          agent_id:     agent.id,
          contact_id:   contact.id,
          telefono:     contact.telefono,
          nombre:       contact.nombre ?? null,
          motivo:       contact.motivo ?? null,
          vapi_call_id: result.callId ?? null,
          status:       'calling',
          called_at:    now,
        });
      } else {
        failed++;
        await transitionOutboundContact({
          supabase, contactId: contact.id,
          toStatus: 'failed',
          actor:    'trigger',
          reason:   'vapi_trigger_failed',
          metadata: { error: result.error },
          soft:     true,
        });
        console.error(`[outbound] vapi failed for contact ${contact.id}:`, result.error);
      }
    } catch (err) {
      failed++;
      console.error(`[outbound] exception for contact ${contact.id}:`, err);
      await transitionOutboundContact({
        supabase, contactId: contact.id,
        toStatus: 'failed',
        actor:    'trigger',
        reason:   'exception_during_trigger',
        metadata: { error: String(err) },
        soft:     true,
      });
    }
  }

  return { triggered, failed };
}
