import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cierra `client_incidents` cuya llamada de verificación +3d ya agotó sus
 * reintentos sin respuesta.
 *
 * Cuando `outbound_contacts.status` termina en 'failed' (max_fails_3 del
 * vapi-webhook, o vapi_trigger_failed / exception_during_trigger del
 * process-due-contacts) o 'dnc', el incident asociado queda huérfano con
 * `verification_result = NULL` para siempre. Este helper detecta esos huérfanos
 * y los marca como 'sin_respuesta' para que aparezcan en la bitácora en gris
 * (no rojo — no es culpa del vendedor si el cliente no contestó).
 *
 * Diseño: batch scan cada corrida del cron outbound (hourly). Idempotente.
 * Solo toca incidents cuyo verification_result sigue null — ya cerrados no
 * se re-tocan.
 */
export async function finalizeOrphanIncidents(
  supabase: SupabaseClient,
): Promise<{ finalized: number }> {
  const { data: terminalContacts, error: fcErr } = await supabase
    .from('outbound_contacts')
    .select('id')
    .eq('external_source', 'client_incident')
    .in('status', ['failed', 'dnc']);
  if (fcErr) throw new Error(`finalizeOrphanIncidents lookup contacts: ${fcErr.message}`);
  if (!terminalContacts?.length) return { finalized: 0 };

  const contactIds = terminalContacts.map(c => c.id as string);

  const { data: orphanIncidents, error: incErr } = await supabase
    .from('client_incidents')
    .select('id')
    .is('verification_result', null)
    .in('verification_outbound_id', contactIds);
  if (incErr) throw new Error(`finalizeOrphanIncidents lookup incidents: ${incErr.message}`);
  if (!orphanIncidents?.length) return { finalized: 0 };

  const incidentIds = orphanIncidents.map(i => i.id as string);
  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('client_incidents')
    .update({
      verification_result:       'sin_respuesta',
      verification_result_notes: 'Callback agotó reintentos sin respuesta',
      verification_called_at:    now,
      updated_at:                now,
    })
    .in('id', incidentIds);
  if (updErr) throw new Error(`finalizeOrphanIncidents update: ${updErr.message}`);

  return { finalized: incidentIds.length };
}
