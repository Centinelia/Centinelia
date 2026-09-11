// src/lib/tools/executors/meefi-escalate-to-human.ts
//
// Executor que rutea escalamientos a aliases Gmail según el topic, envía correo
// real con resumen ejecutivo estructurado.
//
// El envío usa sendMeerkatHtmlEmail, que internamente:
//   1. Intenta enviar por OAuth Gmail/Outlook si el meerkat tiene integración activa.
//   2. Si el meerkat usa SMTP per-agent, delega a sendViaSmtp que hace IMAP APPEND
//      al folder Sent automáticamente (per [[feedback-smtp-imap-append]]).
//   3. Si no hay OAuth/SMTP, cae a Resend (sin IMAP APPEND — Resend no es SMTP).
//
// Concern IMAP APPEND: cuando el path es Resend, no se hace APPEND. Aplica cuando
// Nelia Meefi usa Resend (sin integración OAuth/SMTP configurada). En ese caso el
// Sent del webmail quedará vacío, pero el correo sí sale. El fix correcto es
// conectar una integración SMTP u OAuth al agente Nelia Meefi desde el portal.

import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { createAdminClient } from '@/lib/supabase/admin';

export type EscalationTopic =
  | 'cuentas_docs'
  | 'transferencia_urgente'
  | 'bug_plataforma'
  | 'recovery_2fa'
  | 'otro';

export type EscalationPriority = 'baja' | 'media' | 'alta';

const ALIAS_MAP: Record<EscalationTopic, string> = {
  cuentas_docs:          'nazre20+ashley@gmail.com',
  transferencia_urgente: 'nazre20+emilio@gmail.com',
  bug_plataforma:        'nazre20+jaime@gmail.com',
  recovery_2fa:          'nazre20+ashley@gmail.com',
  otro:                  'nazre20+gera@gmail.com',
};

const NAME_MAP: Record<EscalationTopic, string> = {
  cuentas_docs:          'Ashley (Cuentas)',
  transferencia_urgente: 'Emilio (Operaciones)',
  bug_plataforma:        'Jaime (Plataforma)',
  recovery_2fa:          'Ashley (Cuentas)',
  otro:                  'Equipo Meefi',
};

export interface EscalateToHumanInput {
  topic:            EscalationTopic;
  priority:         EscalationPriority;
  context_summary:  string;
  user_id:          string;
  transcript?:      string;
  hypothesis?:      string;
  evidence_urls?:   string[];
  next_action?:     string;
}

export interface EscalateToHumanResult {
  ok:              boolean;
  sent_to:         string;
  routed_to_name:  string;
  ticket_id:       string;
  provider?:       string;
  error?:          string;
}

export async function executeMeefiEscalateToHuman(
  ctx: any,
  input: EscalateToHumanInput,
): Promise<EscalateToHumanResult> {
  const to         = ALIAS_MAP[input.topic];
  const humanName  = NAME_MAP[input.topic];
  const ticketId   = `esc_${Math.random().toString(36).slice(2, 10)}`;

  const subject = `[Meefi Soporte · ${input.priority.toUpperCase()}] ${input.topic} · ${input.user_id}`;

  const html = renderEscalationHtml({
    ticketId,
    userId:         input.user_id,
    priority:       input.priority,
    topic:          input.topic,
    humanName,
    contextSummary: input.context_summary,
    transcript:     input.transcript  ?? '',
    hypothesis:     input.hypothesis  ?? '',
    evidenceUrls:   input.evidence_urls ?? [],
    nextAction:     input.next_action ?? '',
    timestamp:      new Date().toISOString(),
  });

  // Resolver supabase: preferir ctx.supabase (inyectado en runtime desde el executor
  // host) o crear cliente admin como fallback. Nunca loggear credenciales.
  const supabase: ReturnType<typeof createAdminClient> =
    ctx?.supabase ?? createAdminClient();

  // Datos del agente para el fallback Resend (branding en el From).
  const agent = ctx?.agent
    ? {
        agent_name:            ctx.agent.agent_name  ?? null,
        business_name:         ctx.agent.business_name ?? null,
        email_from:            ctx.agent.email_from  ?? null,
        email_domain_verified: ctx.agent.email_domain_verified ?? null,
      }
    : undefined;

  const agentId: string =
    ctx?.agent?.id ?? ctx?.agent_id ?? process.env.MEEFI_NELIA_AGENT_ID ?? '';

  // From branding Meefi: aunque el dominio remitente sea centinelia.mx (Resend
  // sin dominio verificado meefi.io), el sender name lee "Nelia · Meefi Soporte"
  // en la bandeja del destinatario. Evita el default "Nelia Centinelia" que
  // rompe la narrativa de la demo.
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? 'notificaciones@centinelia.mx';
  const brandedFrom = `Nelia · Meefi Soporte <${fromAddress}>`;

  const sendResult = await sendMeerkatHtmlEmail(
    {
      agentId,
      to,
      subject,
      html,
      from: brandedFrom,
      agent,
    },
    supabase,
  );

  return {
    ok:             sendResult.ok,
    sent_to:        to,
    routed_to_name: humanName,
    ticket_id:      ticketId,
    provider:       sendResult.provider,
    error:          sendResult.error,
  };
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

interface RenderArgs {
  ticketId:       string;
  userId:         string;
  priority:       string;
  topic:          string;
  humanName:      string;
  contextSummary: string;
  transcript:     string;
  hypothesis:     string;
  evidenceUrls:   string[];
  nextAction:     string;
  timestamp:      string;
}

// Formatea timestamp UTC a hora local Ciudad de México (America/Mexico_City).
// Ejemplo: "2026-09-11 13:03 CDT".
function formatTimestampMx(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
  return fmt.format(d);
}

function renderEscalationHtml(args: RenderArgs): string {
  const metaRows = [
    ['Ticket',       args.ticketId],
    ['Prioridad',    args.priority],
    ['Tema',         args.topic],
    ['Responsable',  args.humanName],
    ['Usuario',      args.userId],
    ['Fecha y hora', formatTimestampMx(args.timestamp)],
  ]
    .map(
      ([k, v]) =>
        `<tr>` +
        `<td style="padding:6px 12px;color:#666;white-space:nowrap">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 12px">${escapeHtml(v)}</td>` +
        `</tr>`,
    )
    .join('');

  const evidenceBlock = args.evidenceUrls.length
    ? `<h3 style="color:#1A0A3B;margin:20px 0 8px">Evidencia</h3>` +
      `<ul style="margin:0;padding-left:20px">${args.evidenceUrls
        .map(u => `<li><a href="${escapeHtml(u)}" style="color:#6C3BFF">${escapeHtml(u)}</a></li>`)
        .join('')}</ul>`
    : '';

  // CTA para que Emilio/Ashley/Jaime abran la conversación en el portal Meefi.
  // En producción apuntaría a una vista de detalle del ticket; para la demo apunta
  // al portal de empleados donde ven la actividad de Nelia.
  const portalUrl = 'https://www.centinelia.mx/portal/5RP13tnLK6XX/empleados';
  const ctaBlock =
    `<div style="text-align:center;margin:24px 0 8px">` +
    `<a href="${portalUrl}" style="display:inline-block;background:#6C3BFF;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">` +
    `Abrir conversacion en Meefi` +
    `</a>` +
    `</div>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Inter,system-ui,sans-serif">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#6C3BFF;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:13px;opacity:.8">Meefi Soporte · Escalamiento</p>
      <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700">Nelia te delega un caso</h1>
    </div>
    <div style="padding:28px 32px">
      <table style="border-collapse:collapse;width:100%;margin-bottom:24px;background:#f7f5ff;border-radius:8px">
        ${metaRows}
      </table>

      <h3 style="color:#1A0A3B;margin:0 0 8px">Resumen</h3>
      <p style="margin:0 0 20px;color:#333;line-height:1.6">${escapeHtml(args.contextSummary)}</p>

      ${
        args.hypothesis
          ? `<h3 style="color:#1A0A3B;margin:0 0 8px">Hipotesis</h3>` +
            `<p style="margin:0 0 20px;color:#333;line-height:1.6">${escapeHtml(args.hypothesis)}</p>`
          : ''
      }

      ${
        args.transcript
          ? `<h3 style="color:#1A0A3B;margin:0 0 8px">Conversacion</h3>` +
            `<pre style="background:#f7f5ff;padding:14px;border-radius:8px;white-space:pre-wrap;font-size:13px;color:#333;margin:0 0 20px;overflow-x:auto">${escapeHtml(args.transcript)}</pre>`
          : ''
      }

      ${evidenceBlock}

      ${
        args.nextAction
          ? `<h3 style="color:#1A0A3B;margin:20px 0 8px">Proxima accion sugerida</h3>` +
            `<p style="margin:0 0 20px;color:#333;line-height:1.6">${escapeHtml(args.nextAction)}</p>`
          : ''
      }

      ${ctaBlock}
    </div>
    <div style="background:#f7f5ff;padding:16px 32px;text-align:center">
      <p style="margin:0;font-size:12px;color:#999">Nelia · Meefi Soporte</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c),
  );
}
