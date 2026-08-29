import type { SupabaseClient } from '@supabase/supabase-js';

export interface IncidentFollowupInput {
  incidentId:  string;
  agentId:     string;
  telefono:    string;
  motivo:      string;
  scheduledAt: string;
  nombre?:     string | null;
}

/**
 * Agenda (o re-agenda) la llamada saliente de verificación a +3d por incidencia.
 *
 * `outbound_contacts` tiene UNIQUE INDEX en (agent_id, right(telefono, 10)),
 * así que solo puede existir UN row por (agente, teléfono) sin importar status.
 * Si ya existe un row para el mismo cliente (típicamente de una incidencia previa
 * ya cerrada, o de un pedido pasado), lo reciclamos: sobrescribimos con la nueva
 * intención (motivo, scheduled_at, source='auto_incident_verification', external_id
 * apuntando al nuevo incident_id, status='pending', fail_count=0).
 *
 * Si no existe row previo, INSERT normal.
 */
export async function upsertFollowupContactForIncident(
  supabase: SupabaseClient,
  input: IncidentFollowupInput,
): Promise<{ outbound_contact_id: string }> {
  const { data: existing, error: lookupErr } = await supabase
    .from('outbound_contacts')
    .select('id')
    .eq('agent_id', input.agentId)
    .eq('telefono', input.telefono)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupErr) throw new Error(`upsertFollowupContactForIncident lookup: ${lookupErr.message}`);

  const nombreValue = input.nombre?.trim() || null;

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('outbound_contacts')
      .update({
        motivo:          input.motivo,
        scheduled_at:    input.scheduledAt,
        source:          'auto_incident_verification',
        external_source: 'client_incident',
        external_id:     input.incidentId,
        status:          'pending',
        fail_count:      0,
        nombre:          nombreValue,
      })
      .eq('id', existing.id);
    if (updErr) throw new Error(`upsertFollowupContactForIncident update: ${updErr.message}`);
    return { outbound_contact_id: existing.id as string };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('outbound_contacts')
    .insert({
      agent_id:        input.agentId,
      telefono:        input.telefono,
      motivo:          input.motivo,
      scheduled_at:    input.scheduledAt,
      source:          'auto_incident_verification',
      external_source: 'client_incident',
      external_id:     input.incidentId,
      status:          'pending',
      nombre:          nombreValue,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`upsertFollowupContactForIncident: ${insErr.message}`);
  return { outbound_contact_id: inserted.id };
}
