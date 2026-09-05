// src/lib/tools/executors/verificar-recepcion-incidencia.ts
import { resolveIncidentRecipients } from '../../incidents/directory';
import { renderVerificationReportEmail } from '../../incidents/email-template';
import { sendMeerkatHtmlEmail } from '../../email/send-as-agent';
import { consumeAiOp } from '../../ai/ops-guard';

const ALLOWED = ['ok', 'no_visitado', 'sin_respuesta'] as const;
type Resultado = typeof ALLOWED[number];

interface AttemptRecord {
  called_at: string;
  result:    Resultado;
  notes:     string | null;
}

/**
 * Registra el resultado de un intento de verificación con el cliente. Nelia
 * puede llamar N veces al mismo incident (típicamente cuando la primera no
 * contesta y hay que reintentar en días posteriores). Cada llamada se
 * apendea a `verification_attempts` (JSONB array).
 *
 * `verification_called_at` + `verification_result` reflejan el ÚLTIMO intento
 * — el UI portal, el correo semanal y el cron de seguimiento leen estos
 * campos como valor "actual". El historial completo vive en el array para
 * mostrar la línea de tiempo en el UI cuando aplique.
 *
 * Adicional (2026-09-05, opción B pedida por Tortillería Estrella): tras
 * cada verificación se manda un correo tarjeta a los mismos recipients del
 * directorio con el resultado, para que el owner se entere sin tener que
 * esperar al reporte semanal/mensual. Mismo patrón de envío y cobro que
 * registrar_incidencia.
 */
export async function verificarRecepcionIncidencia(ctx: any, args: {
  incident_id: string;
  resultado: Resultado;
  notas?: string;
}) {
  if (!ALLOWED.includes(args.resultado)) {
    throw new Error(`resultado inválido: ${args.resultado}. Debe ser uno de ${ALLOWED.join(', ')}`);
  }
  if (!ctx?.agent?.id) {
    throw new Error('verificar_recepcion_incidencia: ctx.agent.id requerido para ownership check.');
  }

  // Leer attempts + campos del incidente original para el correo.
  // Incluye `vendedor` (columna solo-humano en bitácora) — si el usuario la
  // pobló al asignar responsable, sale en el correo para responsabilizar.
  const { data: existing, error: readErr } = await ctx.supabase
    .from('client_incidents')
    .select('verification_attempts, business_name, sucursal, contact_name, contact_phone, address, motivo, vendedor, created_at')
    .eq('id', args.incident_id)
    .eq('agent_id', ctx.agent.id)
    .maybeSingle();
  if (readErr) throw new Error(`verificar_recepcion_incidencia read: ${readErr.message}`);
  if (!existing) throw new Error(`verificar_recepcion_incidencia: incident no encontrado o no pertenece a este agente`);

  const attempts: AttemptRecord[] = Array.isArray(existing.verification_attempts)
    ? existing.verification_attempts as AttemptRecord[]
    : [];
  const now = new Date();
  const nowIso = now.toISOString();
  const newAttempt: AttemptRecord = {
    called_at: nowIso,
    result:    args.resultado,
    notes:     args.notas ?? null,
  };
  const updatedAttempts = [...attempts, newAttempt];

  const { error } = await ctx.supabase
    .from('client_incidents')
    .update({
      verification_result:       args.resultado,       // "último resultado" (backwards compat)
      verification_result_notes: args.notas ?? null,
      verification_called_at:    nowIso,               // "última fecha" (backwards compat)
      verification_attempts:     updatedAttempts,      // historial completo
      updated_at:                nowIso,
    })
    .eq('id', args.incident_id)
    .eq('agent_id', ctx.agent.id);
  if (error) throw new Error(`verificar_recepcion_incidencia: ${error.message}`);

  // ─────────────────────────────────────────────────────────────────────
  // Notificación al encargado (correo tarjeta). Fire-and-forget de facto:
  // si el correo falla, el UPDATE del resultado ya se hizo y no vale la
  // pena tirar la tool call. Loguemos y sigamos.
  // ─────────────────────────────────────────────────────────────────────
  const recipients = resolveIncidentRecipients(ctx.org?.directory ?? []);
  let sentCount = 0;
  if (recipients.length > 0) {
    const { subject, html } = renderVerificationReportEmail({
      businessName:            existing.business_name,
      sucursal:                existing.sucursal ?? null,
      contactName:             existing.contact_name ?? null,
      contactPhone:            existing.contact_phone,
      address:                 existing.address,
      motivoOriginal:          existing.motivo,
      motivoOriginalCapturedAt: new Date(existing.created_at),
      resultado:               args.resultado,
      notas:                   args.notas ?? null,
      verifiedAt:              now,
      attemptNumber:           updatedAttempts.length,
      agentDisplayName:        `${ctx.agent.agent_name} · ${ctx.agent.business_name ?? ''}`.trim(),
      vendedor:                existing.vendedor ?? null,
    });
    for (const recipient of recipients) {
      try {
        const sendRes = await sendMeerkatHtmlEmail({
          agentId: ctx.agent.id,
          to:      recipient.email,
          subject,
          html,
          agent: {
            agent_name:            ctx.agent.agent_name,
            business_name:         ctx.agent.business_name,
            email_from:            ctx.agent.email_from,
            email_domain_verified: ctx.agent.email_domain_verified,
          },
        }, ctx.supabase);
        if (sendRes.ok) sentCount += 1;
        else console.warn(`verificar_recepcion_incidencia email a ${recipient.email} failed silently:`, sendRes.error);
      } catch (err) {
        console.error(`verificar_recepcion_incidencia sendMeerkatHtmlEmail a ${recipient.email} threw:`, err);
      }
    }
    if (sentCount > 0) {
      // Cobrar N tareas (una por envío real) en UNA sola RPC. Ver comentario
      // completo en registrar-incidencia.ts sobre por qué batched-consume vs
      // 1-por-iter — evita undercharge silencioso.
      try {
        await consumeAiOp(ctx.agent.id, sentCount, {
          source: 'verificacion_notif',
          label:  sentCount > 1
            ? `Aviso de verificación al encargado por correo (${sentCount} recipients)`
            : 'Aviso de verificación al encargado por correo',
          reference_id: args.incident_id,
        });
      } catch (err) {
        console.error(`verificar_recepcion_incidencia consumeAiOp(${sentCount}) failed silently:`, err);
      }
      await ctx.supabase.from('client_incidents')
        .update({ verification_email_sent_at: new Date().toISOString() })
        .eq('id', args.incident_id);
    }
  }

  return {
    ok:                  true as const,
    incident_id:         args.incident_id,
    verification_result: args.resultado,
    attempt_number:      updatedAttempts.length,
    email_sent:          sentCount > 0,
  };
}
