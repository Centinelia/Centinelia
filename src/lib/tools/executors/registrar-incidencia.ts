// src/lib/tools/executors/registrar-incidencia.ts
import { validatePhoneOrThrow } from '../../leads/dedup';
import { resolveIncidentRecipient } from '../../incidents/directory';
import { renderIncidentCardEmail } from '../../incidents/email-template';
import { upsertFollowupContactForIncident } from '../../incidents/scheduling';
import { sendEmail, agentBrandedFrom } from '../../email/send';

export interface RegistrarIncidenciaArgs {
  business_name: string;
  contact_name?: string;
  contact_phone: string;
  address:       string;
  motivo:        string;
}

const VERIFICATION_DELAY_DAYS = 3;

export async function registrarIncidencia(ctx: any, args: RegistrarIncidenciaArgs) {
  const phone = validatePhoneOrThrow(args.contact_phone);
  const now = new Date();
  const verifyAt = new Date(now.getTime() + VERIFICATION_DELAY_DAYS * 86400 * 1000).toISOString();

  const recipient = resolveIncidentRecipient(ctx.org?.directory ?? []);

  // Detecta si este teléfono ya apareció antes en la bitácora de esta org
  // (misma org = mismos agent_ids). Primera aparición → azul en /oficina/bitacora
  // (marca "cliente nuevo"). Reaparición → fila normal.
  const { data: priorRow } = await ctx.supabase
    .from('client_incidents')
    .select('id')
    .eq('portal_email', ctx.agent.portal_email)
    .eq('contact_phone', phone)
    .limit(1)
    .maybeSingle();
  const isNewClient = !priorRow;

  const { data: incidentRow, error: insErr } = await ctx.supabase
    .from('client_incidents')
    .insert({
      agent_id:                  ctx.agent.id,
      portal_email:              ctx.agent.portal_email,
      business_name:             args.business_name,
      contact_name:              args.contact_name ?? null,
      contact_phone:             phone,
      address:                   args.address,
      motivo:                    args.motivo,
      source_channel:            ctx.channel,
      source_call_id:            ctx.sourceCallId ?? null,
      is_new_client:             isNewClient,
      encargado_email:           recipient?.email ?? null,
      encargado_name:            recipient?.name ?? null,
      verification_scheduled_at: verifyAt,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`registrar_incidencia insert: ${insErr.message}`);
  const incidentId = incidentRow.id;

  let emailSent = false;
  if (recipient) {
    const { subject, html } = renderIncidentCardEmail({
      businessName:     args.business_name,
      contactName:      args.contact_name ?? null,
      contactPhone:     phone,
      address:          args.address,
      motivo:           args.motivo,
      capturedAt:       now,
      agentDisplayName: `${ctx.agent.agent_name} · ${ctx.agent.business_name ?? ''}`.trim(),
    });
    try {
      await sendEmail({
        to:      recipient.email,
        from:    agentBrandedFrom({ agent_name: ctx.agent.agent_name, business_name: ctx.agent.business_name }),
        subject, html,
      });
      await ctx.supabase.from('client_incidents')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', incidentId);
      emailSent = true;
    } catch (err) {
      console.error('registrar_incidencia sendEmail failed:', err);
    }
  }

  const { outbound_contact_id } = await upsertFollowupContactForIncident(ctx.supabase, {
    incidentId,
    agentId:     ctx.agent.id,
    telefono:    phone,
    motivo:      `Verificar si ya recibió pedido reportado el ${now.toLocaleDateString('es-MX')}`,
    scheduledAt: verifyAt,
  });
  await ctx.supabase.from('client_incidents')
    .update({ verification_outbound_id: outbound_contact_id })
    .eq('id', incidentId);

  return { ok: true as const, incident_id: incidentId, email_sent: emailSent, verification_at: verifyAt };
}
