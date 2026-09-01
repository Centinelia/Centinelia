// src/lib/tools/executors/registrar-incidencia.ts
import { validatePhoneOrThrow } from '../../leads/dedup';
import { resolveIncidentRecipients } from '../../incidents/directory';
import { renderIncidentCardEmail } from '../../incidents/email-template';
import { upsertFollowupContactForIncident } from '../../incidents/scheduling';
import { sendMeerkatHtmlEmail } from '../../email/send-as-agent';

export interface RegistrarIncidenciaArgs {
  business_name: string;
  sucursal?:     string;
  contact_name?: string;
  contact_phone: string;
  address:       string;
  motivo:        string;
}

const VERIFICATION_DELAY_DAYS = 3;

// Normaliza para match cliente: lowercase + trim + strip acentos + colapsa espacios.
// "Suc. Apodaca " y "suc apodaca" matchean; "Apodaca" y "San Nicolás" no.
function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function registrarIncidencia(ctx: any, args: RegistrarIncidenciaArgs) {
  const phone = validatePhoneOrThrow(args.contact_phone);
  const now = new Date();
  const verifyAt = new Date(now.getTime() + VERIFICATION_DELAY_DAYS * 86400 * 1000).toISOString();

  const recipients = resolveIncidentRecipients(ctx.org?.directory ?? []);

  // Match cliente por (business_name, sucursal) normalizados. contact_phone es
  // memoria de quién habló, no identidad — un negocio puede tener múltiples
  // personas llamando distintas veces. Fetch todos los incidents de la org y
  // filtramos JS-side (volumen bajo per org, no hay pg extension unaccent).
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
      agent_id:                  ctx.agent.id,
      portal_email:              ctx.agent.portal_email,
      business_name:             args.business_name,
      sucursal:                  args.sucursal?.trim() || null,
      contact_name:              args.contact_name ?? null,
      contact_phone:             phone,
      address:                   args.address,
      motivo:                    args.motivo,
      source_channel:            ctx.channel,
      source_call_id:            ctx.sourceCallId ?? null,
      is_new_client:             isNewClient,
      encargado_email:           recipients.map(r => r.email).join(', ') || null,
      encargado_name:            recipients.map(r => r.name).join(', ') || null,
      verification_scheduled_at: verifyAt,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`registrar_incidencia insert: ${insErr.message}`);
  const incidentId = incidentRow.id;

  let anySent = false;
  if (recipients.length > 0) {
    const { subject, html } = renderIncidentCardEmail({
      businessName:     args.business_name,
      sucursal:         args.sucursal ?? null,
      contactName:      args.contact_name ?? null,
      contactPhone:     phone,
      address:          args.address,
      motivo:           args.motivo,
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
        if (sendRes.ok) anySent = true;
        else console.warn(`registrar_incidencia email a ${recipient.email} failed silently:`, sendRes.error);
      } catch (err) {
        console.error(`registrar_incidencia sendMeerkatHtmlEmail a ${recipient.email} threw:`, err);
      }
    }
    if (anySent) {
      await ctx.supabase.from('client_incidents')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', incidentId);
    }
  }
  const emailSent = anySent;

  const { outbound_contact_id } = await upsertFollowupContactForIncident(ctx.supabase, {
    incidentId,
    agentId:     ctx.agent.id,
    telefono:    phone,
    nombre:      args.contact_name ?? null,
    // Motivo NATURAL — se inyecta después de "Le llamo porque..." en el
    // firstMessage de outbound. Evitar fechas formato numérico (28/8/2026
    // se pronuncia "h h o two thousand twenty six" en TTS) y verbos infinitivos
    // que rompen la gramática con el prefijo del template. Bug 2026-08-28.
    motivo:      `quiero saber si ya recibió el pedido que reportó hace unos días`,
    scheduledAt: verifyAt,
  });
  await ctx.supabase.from('client_incidents')
    .update({ verification_outbound_id: outbound_contact_id })
    .eq('id', incidentId);

  return { ok: true as const, incident_id: incidentId, email_sent: emailSent, verification_at: verifyAt };
}
