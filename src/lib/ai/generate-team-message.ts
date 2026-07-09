import { createAdminClient } from '@/lib/supabase/admin';

const OUTBOUND_ROLE_LABELS: Record<string, string> = {
  vendedor:     'Ejecutivo de ventas',
  cotizador:    'Cotizador',
  seguimiento:  'Agente de seguimiento',
  recuperacion: 'Ejecutivo de recuperación',
  cobrador:     'Cobrador',
};

function buildContent(opts: {
  fromAgentRole: string;
  outcome:       string;
  structured:    Record<string, string | null> | null;
  summary:       string | null;
}): string | null {
  const { outcome, structured, summary } = opts;
  const name    = structured?.nombre    ?? null;
  const service = structured?.servicio  ?? null;
  const items   = structured?.pedido_items ?? null;
  const fecha   = structured?.cita_fecha   ?? null;
  const budget  = structured?.presupuesto  ?? null;

  const parts: string[] = [];

  switch (outcome) {
    case 'lead_created':
      parts.push(name ? `Atendí a ${name}.` : 'Atendí una llamada nueva.');
      if (service) parts.push(`Le interesa: ${service}.`);
      if (budget)  parts.push(`Presupuesto mencionado: ${budget}.`);
      parts.push('Queda en cola para seguimiento.');
      break;

    case 'appointment_booked':
      parts.push(name ? `Agendé cita con ${name}${fecha ? ` para el ${fecha}` : ''}.` : `Agendé una cita${fecha ? ` para el ${fecha}` : ''}.`);
      if (service) parts.push(`Servicio: ${service}.`);
      break;

    case 'order_taken':
      parts.push(name ? `Pedido de ${name}:` : 'Nuevo pedido:');
      if (items) parts.push(items.slice(0, 120) + '.');
      break;

    case 'transferred':
      if (summary) return summary.slice(0, 220);
      parts.push(name ? `Transferí la llamada de ${name} al equipo.` : 'Llamada transferida al equipo.');
      break;

    default:
      return null;
  }

  return parts.filter(Boolean).join(' ');
}

export async function generateTeamMessage(opts: {
  portalEmail:   string;
  fromAgentId:   string;
  fromAgentRole: string;
  vapiCallId:    string | null;
  outcome:       string;
  summary:       string | null;
  structured:    Record<string, string | null> | null;
  callerNumber:  string;
}): Promise<void> {
  const { portalEmail, fromAgentId, fromAgentRole, vapiCallId, outcome, summary, structured, callerNumber } = opts;

  const messageableOutcomes = ['lead_created', 'appointment_booked', 'order_taken', 'transferred', 'info_provided'];
  if (!messageableOutcomes.includes(outcome)) return;

  const supabase = createAdminClient();
  const rows: Record<string, unknown>[] = [];

  const baseMeta = {
    outcome,
    client_name: structured?.nombre ?? null,
    caller:      callerNumber,
  };

  if (outcome === 'info_provided') {
    // Insight: observación de una llamada informativa sin resultado directo
    const parts: string[] = [];
    if (structured?.nombre)   parts.push(`${structured.nombre} preguntó`);
    else                       parts.push('Un cliente preguntó');
    if (structured?.servicio) parts.push(`sobre ${structured.servicio}.`);
    else if (summary)          parts.push(`por información general.`);
    else                       parts.push(`sin dejar datos de contacto.`);
    if (structured?.acciones_pendientes) parts.push(structured.acciones_pendientes);

    rows.push({
      portal_email:  portalEmail,
      from_agent_id: fromAgentId,
      to_agent_id:   null,
      vapi_call_id:  vapiCallId,
      type:          'insight',
      content:       parts.join(' ').slice(0, 280),
      metadata:      baseMeta,
    });
  } else {
    const content = buildContent({ fromAgentRole, outcome, structured, summary });
    if (!content) return;

    // Route handoffs to the right peer when identifiable
    let toAgentId: string | null = null;
    if (outcome === 'lead_created') {
      const { data: peer } = await supabase
        .from('voice_agents')
        .select('id')
        .eq('portal_email', portalEmail)
        .eq('outbound_role', 'vendedor')
        .eq('active', true)
        .neq('id', fromAgentId)
        .maybeSingle();
      toAgentId = peer?.id ?? null;
    } else if (outcome === 'appointment_booked') {
      const { data: peer } = await supabase
        .from('voice_agents')
        .select('id')
        .eq('portal_email', portalEmail)
        .eq('outbound_role', 'seguimiento')
        .eq('active', true)
        .neq('id', fromAgentId)
        .maybeSingle();
      toAgentId = peer?.id ?? null;
    }

    rows.push({
      portal_email:  portalEmail,
      from_agent_id: fromAgentId,
      to_agent_id:   toAgentId,
      vapi_call_id:  vapiCallId,
      type:          'handoff',
      content,
      metadata:      baseMeta,
    });
  }

  // Task: publish pending action as a separate feed item
  if (structured?.acciones_pendientes && outcome !== 'info_provided') {
    rows.push({
      portal_email:  portalEmail,
      from_agent_id: fromAgentId,
      to_agent_id:   null,
      vapi_call_id:  vapiCallId,
      type:          'task',
      content:       structured.acciones_pendientes.slice(0, 280),
      metadata:      baseMeta,
    });
  }

  void OUTBOUND_ROLE_LABELS;

  if (rows.length > 0) {
    await supabase.from('agent_messages').insert(rows);
  }
}
