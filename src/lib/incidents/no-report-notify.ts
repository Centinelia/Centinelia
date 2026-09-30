// src/lib/incidents/no-report-notify.ts
//
// Aviso por correo de llamadas sin reporte (Tortillería Estrella, pedido Ramón
// 2026-09-30). Cada llamada donde no se generó registrar_incidencia,
// registrar_cliente_nuevo, agendar_cita, registrar_pedido ni transferred
// dispara 1 correo al directorio con receives_incident_reports=true.
//
// Reglas:
//   - Sin dedup. 1 llamada = 1 correo. Si mismo número marca 5 veces sin
//     reportar → 5 correos. Ramón lo pidió explícito.
//   - Feature flag opt-in por-org: organizations.notify_calls_without_report.
//   - Lookup nombre por suffix 10 dígitos en outbound_contacts (prioridad)
//     y leads_voice.negocio > leads_voice.nombre.
//   - Recipients = resolveIncidentRecipients(org.directory) — reusa el mismo
//     directorio que registrar_incidencia. Si no hay nadie, no envía.
//   - Cobro batched: 1 llamada a consumeAiOp con count = número de envíos ok.
//   - Fallo de un envío no bloquea los demás; se cobra solo por los ok.

import type { createAdminClient } from '@/lib/supabase/admin';
import type { DirectoryPerson } from '../helpdesk/folio';
import { resolveIncidentRecipients } from './directory';
import { sendMeerkatHtmlEmail } from '../email/send-as-agent';
import { consumeAiOp } from '../ai/ops-guard';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const MX_TZ = 'America/Monterrey';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Outcomes donde SÍ hubo acción concreta capturada por Nelia — NO disparar
// aviso (el encargado ya recibió su correo por otro camino).
const REPORT_OUTCOMES = new Set([
  'incident_registered',   // registrar_incidencia → email directo al encargado
  'lead_created',          // registrar_cliente_nuevo / crear_lead → email nuevo cliente
  'appointment_booked',    // agendar_cita → confirmación al cliente + calendario
  'order_taken',           // registrar_pedido → pedido en sistema
  'transferred',           // notificar_transferencia → fue a un humano
]);

export interface NoReportAgent {
  id:                     string;
  portal_email:           string;
  agent_name:             string;
  business_name?:         string | null;
  email_from?:            string | null;
  email_domain_verified?: boolean | null;
}

export interface NoReportOrg {
  notify_calls_without_report: boolean;
  directory:                   DirectoryPerson[];
}

export interface NoReportCallRow {
  id:               string;
  caller_number:    string | null;
  duration_seconds: number;
  outcome:          string;
  summary?:         string | null;
}

export interface NoReportInput {
  agent:      NoReportAgent;
  org:        NoReportOrg;
  callRow:    NoReportCallRow;
  capturedAt: Date;
}

export type NoReportResult =
  | { skipped: 'flag_off' | 'has_report' | 'no_caller' | 'no_recipients' }
  | { sent: number };

export async function notifyIfNoReport(
  input: NoReportInput,
  supabase: SupabaseClient,
): Promise<NoReportResult> {
  if (!input.org.notify_calls_without_report) {
    return { skipped: 'flag_off' };
  }
  if (REPORT_OUTCOMES.has(input.callRow.outcome)) {
    return { skipped: 'has_report' };
  }

  const rawPhone = input.callRow.caller_number ?? '';
  const suffix = rawPhone.replace(/\D/g, '').slice(-10);
  if (suffix.length < 10) {
    return { skipped: 'no_caller' };
  }

  const recipients = resolveIncidentRecipients(input.org.directory);
  if (recipients.length === 0) {
    return { skipped: 'no_recipients' };
  }

  const knownName = await lookupCallerName(supabase, input.agent.id, suffix);

  const state = input.callRow.outcome === 'unanswered'
    ? 'Colgó antes de conectar con Nelia o el equipo'
    : 'Atendida sin reporte capturado';

  const { subject, html } = renderNoReportEmail({
    knownName,
    callerNumber:     rawPhone,
    capturedAt:       input.capturedAt,
    durationSeconds:  input.callRow.duration_seconds,
    state,
    summary:          input.callRow.summary ?? null,
    agentDisplayName: `${input.agent.agent_name}${input.agent.business_name ? ' · ' + input.agent.business_name : ''}`,
  });

  let sent = 0;
  for (const r of recipients) {
    try {
      const res = await sendMeerkatHtmlEmail({
        agentId: input.agent.id,
        to:      r.email,
        subject,
        html,
        agent: {
          agent_name:            input.agent.agent_name,
          business_name:         input.agent.business_name ?? null,
          email_from:            input.agent.email_from ?? null,
          email_domain_verified: input.agent.email_domain_verified ?? false,
        },
      }, supabase);
      if (res.ok) sent += 1;
      else console.warn(`[no-report-notify] email a ${r.email} failed:`, res.error);
    } catch (err) {
      console.error(`[no-report-notify] sendMeerkatHtmlEmail a ${r.email} threw:`, err);
    }
  }

  if (sent > 0) {
    try {
      await consumeAiOp(input.agent.id, sent, {
        source: 'no_report_notif',
        label:  sent > 1
          ? `Aviso de llamada sin reporte (${sent} destinatarios)`
          : 'Aviso de llamada sin reporte',
        reference_id: input.callRow.id,
      });
    } catch (err) {
      console.error('[no-report-notify] consumeAiOp failed silently:', err);
    }
  }

  return { sent };
}

// ── Lookup nombre del cliente por número ────────────────────────────────────

async function lookupCallerName(
  supabase: SupabaseClient,
  agentId:  string,
  suffix:   string,
): Promise<string | null> {
  // 1. outbound_contacts (fuente principal — Nelia guarda aquí al capturar
  //    llamadas entrantes, y son los "conocidos" que Ramón mencionó).
  const { data: contacts } = await supabase
    .from('outbound_contacts')
    .select('nombre, telefono')
    .eq('agent_id', agentId) as { data: Array<{ nombre: string | null; telefono: string | null }> | null };
  const contact = (contacts ?? []).find(c =>
    (c.telefono ?? '').replace(/\D/g, '').endsWith(suffix),
  );
  if (contact?.nombre) return contact.nombre;

  // 2. leads_voice fallback. Prioridad: negocio > nombre de persona.
  //    Ramón dijo "nombre del negocio/cliente" — el negocio es más útil
  //    para reconocer al que llamó.
  const { data: leads } = await supabase
    .from('leads_voice')
    .select('nombre, negocio, whatsapp')
    .eq('agent_id', agentId)
    .ilike('whatsapp', `%${suffix}%`)
    .limit(1) as { data: Array<{ nombre: string | null; negocio: string | null; whatsapp: string | null }> | null };
  const lead = (leads ?? [])[0];
  if (lead) return lead.negocio ?? lead.nombre ?? null;

  return null;
}

// ── Template HTML ───────────────────────────────────────────────────────────

function formatFecha(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MX_TZ, day: '2-digit', month: 'numeric', year: '2-digit',
  }).formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value ?? '00';
  const monthNum = Number(parts.find(p => p.type === 'month')?.value ?? '1') - 1;
  const year = parts.find(p => p.type === 'year')?.value ?? '00';
  return `${day}-${MONTHS[monthNum]}-${year}`;
}

function formatHora(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MX_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

interface RenderInput {
  knownName:        string | null;
  callerNumber:     string;
  capturedAt:       Date;
  durationSeconds:  number;
  state:            string;
  summary:          string | null;
  agentDisplayName: string;
}

export function renderNoReportEmail(input: RenderInput): { subject: string; html: string } {
  const fecha = formatFecha(input.capturedAt);
  const hora  = formatHora(input.capturedAt);
  const label = input.knownName ?? 'No identificado en base';
  const subject = input.knownName
    ? `Llamada sin reporte: ${input.knownName} (${input.callerNumber}) — ${fecha} ${hora}`
    : `Llamada sin reporte: ${input.callerNumber} — ${fecha} ${hora}`;

  // Bandera color amarillo suave — se distingue visualmente de las incidencias
  // (amarillo intenso) y de nuevo cliente (verde) sin romper el look.
  const bg = '#fef3c7';

  const summaryRow = input.summary
    ? `<tr><td style="background-color: ${bg}; font-weight: bold;">RESUMEN</td><td>${escapeHtml(input.summary)}</td></tr>`
    : '';

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 16px 0; color: #333;">
    Se recibió una llamada donde no se generó reporte. Detalles a continuación:
  </p>
  <table border="1" cellspacing="0" cellpadding="10" style="border-collapse: collapse; width: 100%; border-color: #ccc;">
    <tr><td style="background-color: ${bg}; font-weight: bold; width: 35%;">FECHA</td><td>${fecha}</td></tr>
    <tr><td style="background-color: ${bg}; font-weight: bold;">HORA</td><td>${hora}</td></tr>
    <tr><td style="background-color: ${bg}; font-weight: bold;">TELÉFONO QUE MARCÓ</td><td>${escapeHtml(input.callerNumber)}</td></tr>
    <tr><td style="background-color: ${bg}; font-weight: bold;">CLIENTE EN BASE</td><td>${escapeHtml(label)}</td></tr>
    <tr><td style="background-color: ${bg}; font-weight: bold;">ESTADO</td><td>${escapeHtml(input.state)}</td></tr>
    <tr><td style="background-color: ${bg}; font-weight: bold;">DURACIÓN</td><td>${input.durationSeconds} seg</td></tr>
    ${summaryRow}
  </table>
  <p style="margin: 16px 0 0 0; color: #666; font-size: 13px;">
    Reportado por ${escapeHtml(input.agentDisplayName)}. No hubo reporte capturado durante la llamada.
  </p>
</div>`.trim();

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
