// src/lib/tools/executors/registrar-cliente-nuevo.ts
import { validatePhoneOrThrow } from '../../leads/dedup';
import { resolveIncidentRecipients } from '../../incidents/directory';
import { renderNewClientCardEmail } from '../../incidents/email-template';
import { sendMeerkatHtmlEmail } from '../../email/send-as-agent';
import { consumeAiOp } from '../../ai/ops-guard';

export interface RegistrarClienteNuevoArgs {
  business_name: string;
  sucursal?:     string;
  contact_name?: string;
  contact_phone: string;
  address:       string;
  notas?:        string;
}

// Normaliza para match cliente: NFD + strip diacríticos + lowercase + collapse spaces.
function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function registrarClienteNuevo(ctx: any, args: RegistrarClienteNuevoArgs) {
  const phone = validatePhoneOrThrow(args.contact_phone);
  const now = new Date();

  const recipients = resolveIncidentRecipients(ctx.org?.directory ?? []);

  // Match cliente por (business_name, sucursal) — mismo criterio que quejas.
  // Un cliente que ya se dio de alta antes NO debe salir azul otra vez.
  const normBiz = normalize(args.business_name);
  const normSuc = normalize(args.sucursal ?? '');
  const { data: candidates } = await ctx.supabase
    .from('client_incidents')
    .select('business_name, sucursal')
    .eq('portal_email', ctx.agent.portal_email);
  const isNewClient = !(candidates ?? []).some((r: { business_name: string; sucursal: string | null }) =>
    normalize(r.business_name) === normBiz && normalize(r.sucursal) === normSuc,
  );

  const { data: incidentRow, error: insErr } = await ctx.supabase
    .from('client_incidents')
    .insert({
      agent_id:          ctx.agent.id,
      portal_email:      ctx.agent.portal_email,
      type:              'alta',
      business_name:     args.business_name,
      sucursal:          args.sucursal?.trim() || null,
      contact_name:      args.contact_name ?? null,
      contact_phone:     phone,
      address:           args.address,
      motivo:            args.notas ?? null,
      source_channel:    ctx.channel,
      source_call_id:    ctx.sourceCallId ?? null,
      is_new_client:     isNewClient,
      encargado_email:   recipients.map(r => r.email).join(', ') || null,
      encargado_name:    recipients.map(r => r.name).join(', ') || null,
      // verification_scheduled_at queda NULL — altas no tienen callback +3d.
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`registrar_cliente_nuevo insert: ${insErr.message}`);
  const incidentId = incidentRow.id;

  let anySent = false;
  if (recipients.length > 0) {
    const { subject, html } = renderNewClientCardEmail({
      businessName:     args.business_name,
      sucursal:         args.sucursal ?? null,
      contactName:      args.contact_name ?? null,
      contactPhone:     phone,
      address:          args.address,
      notas:            args.notas ?? null,
      capturedAt:       now,
      agentDisplayName: `${ctx.agent.agent_name} · ${ctx.agent.business_name ?? ''}`.trim(),
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
        if (sendRes.ok) {
          anySent = true;
          // Cobrar 1 tarea por cada correo real enviado (Resend/OAuth tienen
          // costo). Multi-recipient → N tareas. Solo tras éxito, sin refund.
          await consumeAiOp(ctx.agent.id, 1, {
            source: 'alta_cliente_notif',
            label:  'Aviso de alta de cliente al encargado por correo',
            reference_id: incidentId,
          });
        }
        else console.warn(`registrar_cliente_nuevo email a ${recipient.email} failed silently:`, sendRes.error);
      } catch (err) {
        console.error(`registrar_cliente_nuevo sendMeerkatHtmlEmail a ${recipient.email} threw:`, err);
      }
    }
    if (anySent) {
      await ctx.supabase.from('client_incidents')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', incidentId);
    }
  }

  return { ok: true as const, incident_id: incidentId, email_sent: anySent };
}
