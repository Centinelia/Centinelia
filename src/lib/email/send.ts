const FROM     = process.env.RESEND_FROM_EMAIL ?? 'Centinelia <notificaciones@centinelia.mx>';
const LOGO_URL = 'https://www.centinelia.mx/logo-tagline.png';

const C = {
  bg:     '#120726',
  card:   'rgba(255,255,255,0.055)',
  border: 'rgba(255,255,255,0.10)',
  accent: '#9B6DFF',
  text:   '#e2e8f0',
  sub:    'rgba(255,255,255,0.58)',
  mute:   'rgba(255,255,255,0.35)',
  header: '#EDE8FF',
};

// ── Shell ─────────────────────────────────────────────────────────────────────

function shell(body: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">

    <!-- Header lavanda -->
    <div style="background:${C.header};border-radius:16px 16px 0 0;padding:20px 32px;text-align:center;border-bottom:1px solid rgba(108,59,255,0.15)">
      <img src="${LOGO_URL}" alt="Centinelia" width="230" height="89" style="width:230px;height:auto;display:inline-block">
    </div>

    <!-- Body oscuro -->
    <div style="background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      ${body}
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${C.mute};font-size:12px;line-height:1.8;margin:0">
        <a href="https://www.centinelia.mx" style="color:${C.mute};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:${C.accent};text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function badge(label: string, color = C.accent) {
  return `<div style="text-align:center;margin-bottom:20px">
    <span style="display:inline-block;background:${color}22;border:1px solid ${color}40;border-radius:20px;padding:6px 16px;color:${color};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${label}</span>
  </div>`;
}

function heading(title: string, sub?: string) {
  return `<h1 style="color:${C.text};font-size:22px;font-weight:700;margin:0 0 ${sub ? '6px' : '24px'};text-align:center;line-height:1.3">${title}</h1>
  ${sub ? `<p style="color:${C.sub};font-size:13px;margin:0 0 24px;text-align:center">${sub}</p>` : ''}`;
}

function infoCard(content: string, accent = false) {
  return `<div style="background:${accent ? 'rgba(155,109,255,0.10)' : 'rgba(255,255,255,0.04)'};border:1px solid ${accent ? 'rgba(155,109,255,0.25)' : C.border};border-radius:12px;padding:20px;margin-bottom:16px">
    ${content}
  </div>`;
}

function btn(label: string, href: string, primary = true) {
  return `<div style="text-align:center;margin:24px 0 8px">
    <a href="${href}" style="display:inline-block;background:${primary ? 'linear-gradient(135deg,#6C3BFF,#9B6DFF)' : 'transparent'};border:${primary ? 'none' : `1.5px solid ${C.border}`};color:${primary ? '#fff' : C.sub};font-size:14px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px">${label}</a>
  </div>`;
}

function sectionLabel(text: string) {
  return `<p style="color:${C.mute};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">${text}</p>`;
}

function statPill(label: string, color: string) {
  return `<span style="display:inline-block;background:${color}22;color:${color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;letter-spacing:0.05em;text-transform:uppercase">${label}</span>`;
}

// ── sendEmail ─────────────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to:      string;
  subject: string;
  html:    string;
  from?:   string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('Email not configured, missing RESEND_API_KEY'); return false; }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: opts.from ?? FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
  });

  if (!res.ok) { console.error('Email send error:', await res.text()); return false; }
  return true;
}

// ── Weekly report ─────────────────────────────────────────────────────────────

export function weeklyReportHtml(opts: {
  businessName: string;
  portalUrl:    string;
  period:       string;
  totalCalls:   number;
  leads:        number;
  appointments: number;
  orders:       number;
  minutesUsed:  number;
  minutesTotal: number;
  peakHour:     string | null;
}) {
  const pct      = opts.minutesTotal > 0 ? Math.round((opts.minutesUsed / opts.minutesTotal) * 100) : 0;
  const barColor = pct >= 80 ? '#DC2626' : pct >= 60 ? '#D97706' : C.accent;

  const stats: { label: string; value: number; color: string }[] = [
    { label: 'Llamadas', value: opts.totalCalls,   color: C.accent },
    { label: 'Leads',    value: opts.leads,        color: '#A78BFA' },
    { label: 'Citas',    value: opts.appointments, color: '#60A5FA' },
    { label: 'Pedidos',  value: opts.orders,       color: '#FBBF24' },
  ].filter(s => s.value > 0);

  const statsRows = stats.map(s => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${C.border};vertical-align:middle">
        ${statPill(s.label, s.color)}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid ${C.border};color:${s.color};font-size:24px;font-weight:700;text-align:right;line-height:1">${s.value}</td>
    </tr>`).join('');

  const minutesSection = infoCard(`
    ${sectionLabel('Minutos del plan')}
    <div style="background:rgba(255,255,255,0.10);border-radius:6px;height:8px;overflow:hidden;margin-bottom:8px">
      <div style="height:100%;width:${Math.min(pct, 100)}%;background:${barColor};border-radius:6px"></div>
    </div>
    <p style="color:${C.sub};font-size:13px;margin:0">${opts.minutesUsed} de ${opts.minutesTotal} min usados <span style="color:${C.mute}">(${pct}%)</span></p>
    ${opts.peakHour ? `<p style="color:${C.mute};font-size:12px;margin:10px 0 0">Hora pico: <strong style="color:${C.sub}">${opts.peakHour}</strong></p>` : ''}
  `, true);

  return shell(`
    ${badge('Reporte semanal')}
    ${heading(opts.businessName, opts.period)}
    <div style="background:rgba(255,255,255,0.04);border:1px solid ${C.border};border-radius:12px;padding:4px 20px;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse">${statsRows}</table>
    </div>
    ${minutesSection}
    ${btn('Ver portal completo →', opts.portalUrl)}
  `);
}

// ── Welcome ───────────────────────────────────────────────────────────────────

export function welcomeHtml(opts: { businessName: string; setupUrl: string }) {
  return shell(`
    ${badge('Bienvenido a Centinelia', '#9B6DFF')}
    ${heading('Tu agente de voz estará listo pronto', opts.businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Tu pago fue procesado exitosamente. En las próximas horas asignaremos tu número de teléfono dedicado y te avisaremos por WhatsApp cuando tu agente esté en línea.
    </p>
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 24px">
      Mientras tanto, configura tu acceso al portal para monitorear tus llamadas, leads y minutos:
    </p>
    ${btn('Acceder a mi portal →', opts.setupUrl)}
    <div style="height:16px"></div>
    ${infoCard(`
      ${sectionLabel('¿Qué sigue?')}
      <p style="color:${C.sub};font-size:13px;line-height:1.8;margin:0">
        1. Configura tu contraseña en el portal<br>
        2. Recibe tu número de teléfono (próximas horas)<br>
        3. Comparte el número con tus clientes y empieza a recibir llamadas 24/7
      </p>
    `, true)}
  `);
}

// ── New lead / call ───────────────────────────────────────────────────────────

export function newLeadHtml(opts: {
  businessName:  string;
  callerNumber:  string;
  nombre?:       string | null;
  servicio?:     string | null;
  whatsapp?:     string | null;
  email?:        string | null;
  summary?:      string | null;
  outcome:       string;
  portalUrl:     string;
}) {
  const outcomeLabels: Record<string, string> = {
    lead_created:       'Nuevo lead',
    appointment_booked: 'Cita agendada',
    order_taken:        'Pedido tomado',
    transferred:        'Llamada transferida',
    info_provided:      'Consulta atendida',
    other:              'Llamada completada',
  };

  function row(label: string, value: string | null | undefined) {
    if (!value?.trim()) return '';
    return `<tr>
      <td style="padding:9px 0;border-bottom:1px solid ${C.border};color:${C.mute};font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;width:110px;vertical-align:top">${label}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${C.border};color:${C.text};font-size:14px;font-weight:500">${value}</td>
    </tr>`;
  }

  const rows = [
    row('Teléfono', opts.callerNumber),
    row('Nombre',   opts.nombre),
    row('Interés',  opts.servicio),
    row('WhatsApp', opts.whatsapp && opts.whatsapp !== opts.callerNumber ? opts.whatsapp : null),
    row('Email',    opts.email),
  ].join('');

  const summarySection = opts.summary ? infoCard(`
    ${sectionLabel('Resumen de la llamada')}
    <p style="color:${C.sub};font-size:13px;line-height:1.65;margin:0">${opts.summary}</p>
  `, true) : '';

  return shell(`
    ${badge(outcomeLabels[opts.outcome] ?? 'Llamada completada')}
    ${heading(opts.businessName, 'Tu agente de voz capturó nueva actividad')}
    <div style="background:rgba(255,255,255,0.04);border:1px solid ${C.border};border-radius:12px;padding:4px 20px;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse">${rows}</table>
    </div>
    ${summarySection}
    ${btn('Ver en mi portal →', opts.portalUrl)}
  `);
}

// ── Minutes alert ─────────────────────────────────────────────────────────────

export function minutesAlertHtml(opts: {
  businessName: string;
  pct:          number;
  used:         number;
  included:     number;
  resetDate:    string;
  portalUrl:    string;
}) {
  const isPaused   = opts.pct >= 100;
  const alertColor = isPaused ? '#F87171' : '#FBBF24';
  const bodyText   = isPaused
    ? `Tu agente <strong style="color:${C.text}">${opts.businessName}</strong> ha sido <strong style="color:#F87171">pausado automáticamente</strong> al agotar los ${opts.included} minutos de tu plan. Puedes reactivarlo comprando minutos adicionales o cambiando de plan.`
    : `Tu agente <strong style="color:${C.text}">${opts.businessName}</strong> ha usado <strong style="color:#FBBF24">${opts.used} de ${opts.included} minutos</strong> (${Math.round(opts.pct)}%). Si necesitas más antes del ${opts.resetDate}, puedes comprar minutos adicionales o ampliar tu plan.`;

  return shell(`
    ${badge(isPaused ? 'Agente pausado' : `${Math.round(opts.pct)}% de minutos usados`, alertColor)}
    ${heading(opts.businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 24px">${bodyText}</p>
    ${btn('Comprar más minutos →', `${opts.portalUrl}?tab=cuenta`)}
    ${btn('Ampliar mi plan →', `${opts.portalUrl}?tab=cuenta#suscripcion`, false)}
  `);
}

// ── Agent paused ──────────────────────────────────────────────────────────────

export function agentPausedHtml(businessName: string) {
  return shell(`
    ${badge('Agente pausado', '#F87171')}
    ${heading(businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0">
      El período de gracia de 3 días venció sin recibir el pago de tu suscripción Centinelia.
      Tu agente de voz ha sido <strong style="color:${C.text}">pausado</strong>.
      Para reactivarlo, actualiza tu método de pago o contáctanos a
      <a href="mailto:hola@centinelia.mx" style="color:${C.accent};text-decoration:none">hola@centinelia.mx</a>.
    </p>
  `);
}

// ── Payment failed ────────────────────────────────────────────────────────────

export function paymentFailedHtml(businessName: string) {
  return shell(`
    ${badge('Pago fallido', '#F87171')}
    ${heading(businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0">
      No pudimos procesar el pago de tu suscripción Centinelia.<br><br>
      Tienes <strong style="color:${C.text}">3 días</strong> para actualizar tu método de pago antes de que el agente de voz sea pausado automáticamente.
    </p>
  `);
}

// ── Empresarial confirmation ──────────────────────────────────────────────────

export function empresarialConfirmationHtml(opts: {
  clientName:   string;
  businessName: string;
  contactEmail: string;
}) {
  return shell(`
    ${badge('Solicitud recibida', '#FBBF24')}
    ${heading(`Hola, ${opts.clientName}`, opts.businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Recibimos tu solicitud para el plan Empresarial de Centinelia. Nuestro equipo revisará los requerimientos de <strong style="color:${C.text}">${opts.businessName}</strong> y te contactará en menos de 24 horas con una propuesta personalizada.
    </p>
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 24px">
      Te escribiremos a este correo y también por WhatsApp al número que nos diste.
    </p>
    ${infoCard(`
      ${sectionLabel('Lo que sigue')}
      <p style="color:${C.sub};font-size:13px;line-height:1.8;margin:0">
        1. Revisión de tus necesidades de integración<br>
        2. Propuesta personalizada con precio final<br>
        3. Llamada de onboarding con el equipo de Centinelia
      </p>
    `, true)}
    ${btn('Responder este correo →', `mailto:${opts.contactEmail}`, false)}
  `);
}

// ── Client-facing shell (appears to come from the business) ───────────────────

export interface EmailBranding {
  logoUrl:    string | null;
  brandColor: string;
  footerText: string | null;
  senderName: string;
  website?:   string | null;
  address?:   string | null;
}

function clientShell(branding: EmailBranding, body: string) {
  const color  = branding.brandColor || '#6C3BFF';
  const BG     = '#F8F7FF';
  const CARD   = '#FFFFFF';
  const BORDER = `${color}1A`;
  const TEXT   = '#1A0A3B';
  const SUB    = 'rgba(26,10,59,0.6)';
  const MUTE   = 'rgba(26,10,59,0.35)';

  const headerContent = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.senderName}" style="max-height:56px;max-width:200px;display:inline-block;object-fit:contain">`
    : `<span style="font-size:18px;font-weight:800;color:${TEXT}">${branding.senderName}</span>`;

  const footerLines: string[] = [];
  if (branding.footerText) footerLines.push(`<p style="color:${MUTE};font-size:11px;margin:0 0 4px;line-height:1.7">${branding.footerText}</p>`);
  const contactParts = [branding.address, branding.website].filter(Boolean);
  if (contactParts.length) footerLines.push(`<p style="color:${MUTE};font-size:11px;margin:0 0 4px;line-height:1.7">${contactParts.join(' · ')}</p>`);

  const renderedBody = body
    .replace(/\{\{TEXT\}\}/g, TEXT)
    .replace(/\{\{SUB\}\}/g, SUB)
    .replace(/\{\{ACCENT\}\}/g, color)
    .replace(/\{\{BORDER\}\}/g, BORDER);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:540px;margin:0 auto;padding:32px 16px 48px">
    <div style="text-align:center;padding:20px 0 16px">
      ${headerContent}
    </div>
    <div style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:32px">
      ${renderedBody}
    </div>
    <div style="text-align:center;padding:16px 0 0">
      ${footerLines.join('\n      ')}
      <p style="color:rgba(26,10,59,0.22);font-size:10px;margin:0;line-height:1.7">
        Enviado a través de <a href="https://www.centinelia.mx" style="color:rgba(26,10,59,0.3);text-decoration:none">Centinelia</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Appointment confirmation to caller ────────────────────────────────────────

export function appointmentConfirmationToClientHtml(opts: {
  branding?:    EmailBranding;
  businessName: string;
  agentName:    string;
  clientName:   string | null;
  citaFecha:    string | null;
  citaHora:     string | null;
  servicio:     string | null;
  phone:        string | null;
}) {
  const branding = opts.branding ?? { logoUrl: null, brandColor: '#6C3BFF', footerText: null, senderName: opts.businessName };
  const greeting = opts.clientName ? `Hola, ${opts.clientName}` : 'Hola';

  const dateStr = (() => {
    if (!opts.citaFecha) return null;
    const d = new Date(opts.citaFecha + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  })();

  const rows = [
    dateStr       && `<tr><td style="padding:10px 0;border-bottom:1px solid {{BORDER}};color:rgba(26,10,59,0.4);font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;width:90px">Fecha</td><td style="padding:10px 0;border-bottom:1px solid {{BORDER}};color:{{TEXT}};font-size:14px;font-weight:600">${dateStr}</td></tr>`,
    opts.citaHora && `<tr><td style="padding:10px 0;border-bottom:1px solid {{BORDER}};color:rgba(26,10,59,0.4);font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;width:90px">Hora</td><td style="padding:10px 0;border-bottom:1px solid {{BORDER}};color:{{TEXT}};font-size:14px;font-weight:600">${opts.citaHora} h</td></tr>`,
    opts.servicio && `<tr><td style="padding:10px 0;color:rgba(26,10,59,0.4);font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;width:90px">Servicio</td><td style="padding:10px 0;color:{{TEXT}};font-size:14px">${opts.servicio}</td></tr>`,
  ].filter(Boolean).join('');

  const contactLine = opts.phone
    ? `<p style="color:{{SUB}};font-size:13px;line-height:1.7;margin:20px 0 0">¿Necesitas cambiar tu cita? Llámanos al <strong>${opts.phone}</strong>.</p>`
    : '';

  return clientShell(branding, `
    <div style="text-align:center;margin-bottom:20px">
      <span style="display:inline-block;background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:20px;padding:6px 16px;color:{{ACCENT}};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Cita confirmada</span>
    </div>
    <h1 style="color:{{TEXT}};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">${greeting}</h1>
    <p style="color:{{SUB}};font-size:14px;margin:0 0 24px;text-align:center">Tu cita en <strong>${opts.businessName}</strong> quedó registrada.</p>
    <div style="background:rgba(108,59,255,0.04);border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:4px 20px;margin-bottom:16px">
      <table style="width:100%;border-collapse:collapse">${rows}</table>
    </div>
    ${contactLine}
    <p style="color:rgba(26,10,59,0.35);font-size:12px;margin:24px 0 0">— ${opts.agentName}, ${opts.businessName}</p>
  `);
}

// ── Contract to client ────────────────────────────────────────────────────────

export function contractToClientHtml(opts: {
  branding:     EmailBranding;
  businessName: string;
  clientName:   string | null;
  clauses:      { title: string; body: string }[];
}) {
  const greeting = opts.clientName ? `Hola, ${opts.clientName}` : 'Hola';
  const clauseBlocks = opts.clauses.map(c => `
    <div style="margin-bottom:20px">
      <p style="color:rgba(26,10,59,0.4);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 6px">${c.title}</p>
      <p style="color:{{TEXT}};font-size:13px;line-height:1.75;margin:0;white-space:pre-wrap">${c.body.replace(/\n/g, '<br>')}</p>
    </div>
  `).join('<hr style="border:none;border-top:1px solid {{BORDER}};margin:16px 0">');

  return clientShell(opts.branding, `
    <div style="text-align:center;margin-bottom:20px">
      <span style="display:inline-block;background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:20px;padding:6px 16px;color:{{ACCENT}};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Contrato de servicios</span>
    </div>
    <h1 style="color:{{TEXT}};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">${greeting}</h1>
    <p style="color:{{SUB}};font-size:14px;margin:0 0 24px;text-align:center">
      A continuación encontrarás el contrato de prestación de servicios con <strong>${opts.businessName}</strong>.
    </p>
    <div style="background:rgba(26,10,59,0.03);border:1px solid {{BORDER}};border-radius:12px;padding:24px;margin-bottom:16px">
      ${clauseBlocks}
    </div>
    <p style="color:rgba(26,10,59,0.35);font-size:12px;margin:16px 0 0;text-align:center">
      Para cualquier duda sobre este contrato, responde directamente a este correo.
    </p>
  `);
}

// ── Lead follow-up to caller ──────────────────────────────────────────────────

export function leadFollowUpToClientHtml(opts: {
  branding?:    EmailBranding;
  businessName: string;
  agentName:    string;
  clientName:   string | null;
  servicio:     string | null;
  phone:        string | null;
}) {
  const branding = opts.branding ?? { logoUrl: null, brandColor: '#6C3BFF', footerText: null, senderName: opts.businessName };
  const greeting = opts.clientName ? `Hola, ${opts.clientName}` : 'Hola';
  const serviceLine = opts.servicio
    ? `<p style="color:{{SUB}};font-size:14px;line-height:1.7;margin:0 0 16px">Recibimos tu solicitud sobre <strong style="color:{{TEXT}}">${opts.servicio}</strong>. Un miembro de nuestro equipo se comunicará contigo a la brevedad.</p>`
    : `<p style="color:{{SUB}};font-size:14px;line-height:1.7;margin:0 0 16px">Recibimos tu solicitud. Un miembro de nuestro equipo se comunicará contigo a la brevedad.</p>`;

  const contactLine = opts.phone
    ? `<p style="color:{{SUB}};font-size:13px;line-height:1.7;margin:0">Si prefieres, puedes llamarnos directamente al <strong>${opts.phone}</strong>.</p>`
    : '';

  return clientShell(branding, `
    <div style="text-align:center;margin-bottom:20px">
      <span style="display:inline-block;background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:20px;padding:6px 16px;color:{{ACCENT}};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Recibimos tu mensaje</span>
    </div>
    <h1 style="color:{{TEXT}};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">${greeting}</h1>
    <p style="color:{{SUB}};font-size:14px;margin:0 0 20px;text-align:center">Gracias por contactar a <strong>${opts.businessName}</strong>.</p>
    ${serviceLine}
    ${contactLine}
    <p style="color:rgba(26,10,59,0.35);font-size:12px;margin:24px 0 0">— ${opts.agentName}, ${opts.businessName}</p>
  `);
}
