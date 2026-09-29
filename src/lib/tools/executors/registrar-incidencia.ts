// src/lib/tools/executors/registrar-incidencia.ts
import { validatePhoneOrThrow } from '../../leads/dedup';
import { resolveIncidentRecipients } from '../../incidents/directory';
import { renderIncidentCardEmail } from '../../incidents/email-template';
import { upsertFollowupContactForIncident } from '../../incidents/scheduling';
import { sendMeerkatHtmlEmail } from '../../email/send-as-agent';
import { consumeAiOp } from '../../ai/ops-guard';

export interface RegistrarIncidenciaArgs {
  business_name: string;
  sucursal?:     string;
  contact_name?: string;
  contact_phone: string;
  address:       string;
  motivo:        string;
}

const VERIFICATION_DELAY_DAYS = 3;

// Ventana anti-duplicado: Nelia invocó registrar_incidencia 2 veces con
// toolCallIds distintos en 15.7s para Tecate Six Cantú (2026-09-29 18:35 UTC).
// El modelo puede reinvocar la tool con el motivo enriquecido, o creyendo que
// la primera call no respondió. Sin dedup se ensucian 3 cosas: (1) rows
// duplicadas en client_incidents, (2) N × 2 emails al encargado, (3) doble
// cobro que viola pool accuracy. 5 min cubre reinvocaciones dentro del mismo
// call y contra retries que hayan tardado más que el turno de conversación.
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

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
  // Extendido para dedup: también leemos id + contact_phone + email_sent_at +
  // verification_scheduled_at + created_at para poder retornar el incident
  // existente si es un duplicado dentro de la ventana.
  const normBiz = normalize(args.business_name);
  const normSuc = normalize(args.sucursal ?? '');
  const { data: candidates } = await ctx.supabase
    .from('client_incidents')
    .select('id, business_name, sucursal, contact_phone, email_sent_at, verification_scheduled_at, created_at')
    .eq('portal_email', ctx.agent.portal_email);

  // Dedup content-based: si ya existe un incident con misma (bizNorm, sucNorm,
  // phone) creado hace <5 min, retornamos ese incident_id sin insertar, sin
  // notificar y sin cobrar. Es el caso Tecate Six 2026-09-29 (ver
  // DUPLICATE_WINDOW_MS arriba). Diferencia con is_new_client: aquí SÍ
  // requerimos que el teléfono también matchee — es señal de que es la MISMA
  // llamada, no otra persona reportando la misma sucursal en momentos distintos.
  type Candidate = {
    id: string;
    business_name: string;
    sucursal: string | null;
    contact_phone: string | null;
    email_sent_at: string | null;
    verification_scheduled_at: string;
    created_at: string;
  };
  const cutoff = now.getTime() - DUPLICATE_WINDOW_MS;
  const dup = (candidates ?? []).find((r: Candidate) =>
    normalize(r.business_name) === normBiz &&
    normalize(r.sucursal) === normSuc &&
    r.contact_phone === phone &&
    new Date(r.created_at).getTime() >= cutoff,
  );
  if (dup) {
    console.log('[registrar_incidencia] dedup hit — returning existing incident', {
      incident_id: dup.id, business: args.business_name, phone,
      age_ms: now.getTime() - new Date(dup.created_at).getTime(),
    });
    return {
      ok: true as const,
      incident_id:     dup.id,
      email_sent:      !!dup.email_sent_at,
      verification_at: dup.verification_scheduled_at,
    };
  }

  const isNewClient = !(candidates ?? []).some((r: Candidate) =>
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

  // Cobro base work-based: registrar una queja (categorizar, resolver duplicado,
  // agendar callback) es trabajo del meerkat independiente de los emails que
  // dispare. Los cobros por notif email siguen abajo como cargos adicionales.
  try {
    await consumeAiOp(ctx.agent.id, 1, {
      source: 'incident_registered',
      label:  'Registro de queja',
      reference_id: incidentId,
    });
  } catch (err) {
    console.error('registrar_incidencia consumeAiOp base failed silently:', err);
  }

  let sentCount = 0;
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
        if (sendRes.ok) sentCount += 1;
        else console.warn(`registrar_incidencia email a ${recipient.email} failed silently:`, sendRes.error);
      } catch (err) {
        console.error(`registrar_incidencia sendMeerkatHtmlEmail a ${recipient.email} threw:`, err);
      }
    }
    if (sentCount > 0) {
      // Cobrar N tareas (una por envío real) en UNA sola llamada al final del
      // loop. El patrón anterior cobraba 1 tarea por iteración adentro del for,
      // pero en producción vimos undercharge sistemático en multi-recipient
      // (2 envíos ok, 1 sola fila en ops_ledger). Root cause no confirmada
      // (posible timeout Vercel, race, o retry Vapi que corta el 2do await).
      // Cambio a batched-consume: 1 sola RPC + 1 sola INSERT, superficie mínima
      // para que se caiga a la mitad. try/catch para no abortar el flow si el
      // cobro tira — los envíos ya salieron y el registro ya se hizo, no vale
      // devolverle "intenta de nuevo" al meerkat. Drift detector detecta el
      // undercharge en <1h como red de seguridad.
      try {
        await consumeAiOp(ctx.agent.id, sentCount, {
          source: 'incidencia_notif',
          label:  sentCount > 1
            ? `Aviso de queja al encargado por correo (${sentCount} recipients)`
            : 'Aviso de queja al encargado por correo',
          reference_id: incidentId,
        });
      } catch (err) {
        console.error(`registrar_incidencia consumeAiOp(${sentCount}) failed silently:`, err);
      }
      await ctx.supabase.from('client_incidents')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', incidentId);
    }
  }
  const emailSent = sentCount > 0;

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
