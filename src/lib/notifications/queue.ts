/**
 * Queue de eventos para el digest diario del owner.
 *
 * Uso desde cualquier lugar que dispare una acción notificable
 * (llamada exitosa, correo respondido, tarea de oficina completada, etc.):
 *
 *   await queueNotificationEvent({
 *     portalEmail: agent.portal_email,
 *     agentId:     agent.id,
 *     kind:        'call_outcome',
 *     urgent:      outcome === 'lead_created' || outcome === 'transferred',
 *     payload:     { outcome, callerNumber, summary, structured },
 *   });
 *
 * Semántica:
 * - urgent=true → envía email inmediato Y marca delivered_at=now
 * - urgent=false → solo INSERT; el cron daily-digest lo agrupa al cierre del día
 *
 * Nunca throw (fire-and-forget). Los errores se loggean.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { urgentEventHtml } from './templates';

export type NotificationKind =
  | 'call_outcome'
  | 'email_replied'
  | 'task_completed'
  | 'delegation_completed'
  | 'document_created'
  | 'outbound_success'
  | 'survey_completed'
  | 'dnc_marked';

export interface NotificationEventInput {
  portalEmail: string;
  agentId:     string;
  kind:        NotificationKind;
  urgent?:     boolean;
  payload?:    Record<string, unknown>;
}

export async function queueNotificationEvent(input: NotificationEventInput): Promise<void> {
  const { portalEmail, agentId, kind, urgent = false, payload = {} } = input;

  if (!portalEmail || !agentId || !kind) return;

  const supabase = createAdminClient();

  try {
    // Gate por notify_email del agente. Si el owner apagó notificaciones,
    // no encolamos nada — evita que el digest quede lleno de basura para
    // un owner que las tiene desactivadas.
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id, notify_email, agent_name, business_name, client_email')
      .eq('id', agentId)
      .maybeSingle();

    if (!agent) return;
    if (agent.notify_email === false) return;

    const { data: event, error } = await supabase
      .from('notification_events')
      .insert({
        portal_email: portalEmail,
        agent_id:     agentId,
        kind,
        urgent,
        payload,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[notifications queue] insert failed', error);
      return;
    }

    // Urgent → envío inmediato + marca delivered
    if (urgent && agent.client_email) {
      try {
        await sendEmail({
          to:      agent.client_email as string,
          subject: `URGENTE: ${describeKind(kind, payload)} — ${agent.business_name}`,
          html:    urgentEventHtml({
            agentName:    agent.agent_name as string | null,
            businessName: agent.business_name as string,
            kind,
            payload,
          }),
        });
        await supabase
          .from('notification_events')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', event.id);
      } catch (err) {
        console.error('[notifications queue] urgent send failed', err);
      }
    }
  } catch (err) {
    console.error('[notifications queue] unexpected', err);
  }
}

function describeKind(kind: NotificationKind, payload: Record<string, unknown>): string {
  switch (kind) {
    case 'call_outcome': {
      const outcome = payload.outcome as string | undefined;
      if (outcome === 'lead_created')       return 'Nuevo lead capturado';
      if (outcome === 'appointment_booked') return 'Cita agendada';
      if (outcome === 'order_taken')        return 'Nuevo pedido';
      if (outcome === 'transferred')        return 'Llamada transferida';
      return 'Llamada atendida';
    }
    case 'email_replied':        return 'Correo respondido';
    case 'task_completed':       return 'Tarea completada';
    case 'delegation_completed': return 'Delegación terminada';
    case 'document_created':     return 'Documento generado';
    case 'outbound_success':     return 'Llamada saliente exitosa';
    case 'survey_completed':     return 'Encuesta completada';
    case 'dnc_marked':           return 'Número agregado a No Llamar';
  }
}
