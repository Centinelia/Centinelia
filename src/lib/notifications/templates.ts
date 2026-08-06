/**
 * Templates HTML de emails de notificación.
 *
 * - urgentEventHtml: 1 evento aislado, envío inmediato (kind con urgent=true)
 * - dailyDigestHtml: N eventos agrupados por sección, envío al cierre del día
 *
 * Estilo alineado al resto de emails de Centinelia:
 * table-based (compat cliente correo), colores hex (no rgba), .force-white
 * para móvil dark mode.
 */

import type { NotificationKind } from './queue';

const BRAND        = '#6C3BFF';
const BG_SURFACE   = '#F7F5FF';
const TEXT_PRIMARY = '#1A0A3B';
const TEXT_MUTED   = '#6B6480';
const BORDER       = '#E8E3F5';

// ─── Urgente (1 evento) ──────────────────────────────────────────────────────

export function urgentEventHtml(input: {
  agentName:    string | null;
  businessName: string;
  kind:         NotificationKind;
  payload:      Record<string, unknown>;
}): string {
  const { agentName, businessName, kind, payload } = input;
  const rows = payloadToRows(kind, payload);

  return baseEmail({
    preheader: `${agentName ?? 'Tu empleado'} necesita tu atención`,
    body: `
      <tr>
        <td style="padding:24px 32px 8px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND};">
            Aviso urgente
          </p>
          <h1 style="margin:6px 0 4px;font-size:22px;line-height:1.25;color:${TEXT_PRIMARY};">
            ${describeKindLabel(kind, payload)}
          </h1>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};">
            ${agentName ?? 'Tu empleado'} · ${businessName}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:${BG_SURFACE};border-radius:12px;border:1px solid ${BORDER};">
            ${rows.map(r => `
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;width:35%;vertical-align:top;">
                  ${escapeHtml(r.label)}
                </td>
                <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-size:13px;color:${TEXT_PRIMARY};">
                  ${escapeHtml(r.value)}
                </td>
              </tr>
            `).join('')}
          </table>
        </td>
      </tr>
    `,
  });
}

// ─── Digest diario (N eventos agrupados) ─────────────────────────────────────

export interface DigestSection {
  title:  string;
  count:  number;
  items:  { agent: string; when: string; summary: string }[];
}

export function dailyDigestHtml(input: {
  businessName: string;
  dateLabel:    string;
  sections:     DigestSection[];
  portalUrl:    string;
}): string {
  const { businessName, dateLabel, sections, portalUrl } = input;
  const totalCount = sections.reduce((s, sec) => s + sec.count, 0);

  return baseEmail({
    preheader: `${totalCount} actividades del día en ${businessName}`,
    body: `
      <tr>
        <td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND};">
            Resumen del día
          </p>
          <h1 style="margin:6px 0 4px;font-size:26px;line-height:1.2;color:${TEXT_PRIMARY};">
            ${escapeHtml(businessName)}
          </h1>
          <p style="margin:0;font-size:13px;color:${TEXT_MUTED};">
            ${escapeHtml(dateLabel)} · ${totalCount} ${totalCount === 1 ? 'actividad' : 'actividades'}
          </p>
        </td>
      </tr>

      ${sections.map(sec => `
        <tr>
          <td style="padding:20px 32px 4px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${TEXT_MUTED};">
              ${escapeHtml(sec.title)} · ${sec.count}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="background:${BG_SURFACE};border-radius:12px;border:1px solid ${BORDER};">
              ${sec.items.map((it, i) => `
                <tr>
                  <td style="padding:12px 16px;${i < sec.items.length - 1 ? `border-bottom:1px solid ${BORDER};` : ''}">
                    <p style="margin:0 0 3px;font-size:13px;color:${TEXT_PRIMARY};font-weight:500;">
                      ${escapeHtml(it.summary)}
                    </p>
                    <p style="margin:0;font-size:11px;color:${TEXT_MUTED};">
                      ${escapeHtml(it.agent)} · ${escapeHtml(it.when)}
                    </p>
                  </td>
                </tr>
              `).join('')}
            </table>
          </td>
        </tr>
      `).join('')}

      <tr>
        <td style="padding:24px 32px 32px;text-align:center;">
          <a href="${portalUrl}" style="display:inline-block;padding:10px 24px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">
            Ver detalles en el portal
          </a>
        </td>
      </tr>
    `,
  });
}

// ─── Base + helpers ──────────────────────────────────────────────────────────

function baseEmail(input: { preheader: string; body: string }): string {
  const { preheader, body } = input;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media (prefers-color-scheme:dark){.force-white{color:${TEXT_PRIMARY} !important;}}
</style>
</head>
<body style="margin:0;padding:0;background:#F0EDF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <div style="display:none;overflow:hidden;line-height:1;opacity:0;max-height:0;max-width:0;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0EDF9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,10,59,.06);">
          ${body}
          <tr>
            <td style="padding:16px 32px;background:${BG_SURFACE};border-top:1px solid ${BORDER};text-align:center;">
              <p class="force-white" style="margin:0;font-size:11px;color:${TEXT_MUTED};">
                Centinelia · empleados digitales que trabajan por ti
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function payloadToRows(kind: NotificationKind, payload: Record<string, unknown>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const p = payload as any;
  if (kind === 'call_outcome') {
    if (p.callerNumber) rows.push({ label: 'Número',    value: String(p.callerNumber) });
    if (p.nombre)       rows.push({ label: 'Contacto',  value: String(p.nombre) });
    if (p.summary)      rows.push({ label: 'Resumen',   value: String(p.summary).slice(0, 400) });
  } else if (kind === 'email_replied') {
    if (p.to)           rows.push({ label: 'Para',      value: String(p.to) });
    if (p.subject)      rows.push({ label: 'Asunto',    value: String(p.subject) });
  } else if (kind === 'task_completed' || kind === 'delegation_completed') {
    if (p.title)        rows.push({ label: 'Tarea',     value: String(p.title) });
    if (p.result)       rows.push({ label: 'Resultado', value: String(p.result).slice(0, 400) });
  } else {
    for (const [k, v] of Object.entries(payload)) {
      if (typeof v === 'string' || typeof v === 'number') {
        rows.push({ label: k, value: String(v).slice(0, 400) });
      }
    }
  }
  if (!rows.length) rows.push({ label: 'Detalle', value: 'Sin datos adicionales' });
  return rows;
}

function describeKindLabel(kind: NotificationKind, payload: Record<string, unknown>): string {
  const p = payload as any;
  if (kind === 'call_outcome') {
    const outcome = p.outcome as string | undefined;
    if (outcome === 'lead_created')       return 'Nuevo lead capturado';
    if (outcome === 'appointment_booked') return 'Cita agendada';
    if (outcome === 'order_taken')        return 'Nuevo pedido';
    if (outcome === 'transferred')        return 'Llamada transferida';
    return 'Llamada atendida';
  }
  if (kind === 'email_replied')        return 'Correo respondido';
  if (kind === 'task_completed')       return 'Tarea completada';
  if (kind === 'delegation_completed') return 'Delegación terminada';
  if (kind === 'document_created')     return 'Documento generado';
  if (kind === 'outbound_success')     return 'Llamada saliente exitosa';
  if (kind === 'survey_completed')     return 'Encuesta completada';
  if (kind === 'dnc_marked')           return 'Número agregado a No Llamar';
  return 'Actividad';
}

export function sectionTitleForKind(kind: NotificationKind): string {
  switch (kind) {
    case 'call_outcome':          return 'Llamadas entrantes';
    case 'outbound_success':      return 'Llamadas salientes';
    case 'email_replied':         return 'Correos respondidos';
    case 'task_completed':        return 'Tareas de oficina';
    case 'delegation_completed':  return 'Delegaciones entre empleados';
    case 'document_created':      return 'Documentos generados';
    case 'survey_completed':      return 'Encuestas completadas';
    case 'dnc_marked':            return 'No Llamar';
  }
}

export function summaryForEvent(kind: NotificationKind, payload: Record<string, unknown>): string {
  const p = payload as any;
  if (kind === 'call_outcome') {
    const outcome = p.outcome as string | undefined;
    const who     = p.nombre ?? p.callerNumber ?? 'Contacto sin nombre';
    if (outcome === 'lead_created')       return `Lead: ${who}`;
    if (outcome === 'appointment_booked') return `Cita agendada con ${who}`;
    if (outcome === 'order_taken')        return `Pedido de ${who}`;
    if (outcome === 'transferred')        return `Transferida — ${who}`;
    return `Atendida — ${who}`;
  }
  if (kind === 'email_replied')        return p.subject ? String(p.subject) : 'Correo respondido';
  if (kind === 'task_completed')       return p.title   ? String(p.title)   : 'Tarea completada';
  if (kind === 'delegation_completed') return p.title   ? String(p.title)   : 'Delegación completada';
  if (kind === 'document_created')     return p.doc_type ? `${p.doc_type}${p.title ? `: ${p.title}` : ''}` : 'Documento generado';
  if (kind === 'outbound_success')     return p.to ? `Llamada a ${p.to}` : 'Saliente exitosa';
  if (kind === 'survey_completed')     return p.contact ? `Encuesta a ${p.contact}` : 'Encuesta completada';
  if (kind === 'dnc_marked')           return p.number ? `Agregado ${p.number}` : 'Número agregado';
  return 'Actividad';
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
