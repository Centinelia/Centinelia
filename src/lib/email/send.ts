const FROM     = process.env.RESEND_FROM_EMAIL ?? 'Centinelia <notificaciones@centinelia.mx>';
const LOGO_URL = 'https://www.centinelia.mx/logo-tagline.png';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

// Extrae la dirección del FROM configurado ("Name <addr>" o solo "addr").
// Se usa para construir Froms brandeados por agente sin cambiar el dominio
// (que debe estar verificado en Resend). Sigue enviando desde Centinelia,
// solo cambia el display name a algo tipo "Sofía (empleado)".
function fromAddress(): string {
  const match = FROM.match(/<([^>]+)>/) ?? FROM.match(/(\S+@\S+)/);
  return match ? match[1] : 'notificaciones@centinelia.mx';
}

/**
 * From con display name del empleado usando "Centinelia" como apellido.
 * Cero consumo de cuota Gmail del cliente. El humano ve "Sofía Centinelia"
 * en negritas en su bandeja aunque técnicamente el correo sale de
 * notificaciones@centinelia.mx. Convención: a los empleados que no
 * conoces por nombre les llamas "Centinelias".
 */
export function agentBrandedFrom(agentName: string | null | undefined): string {
  const name = (agentName ?? '').trim();
  if (!name) return FROM;
  return `${name} Centinelia <${fromAddress()}>`;
}

// Email colors — SOLID hex only. Semi-transparent rgba() breaks in Gmail/
// Titan/Outlook web because those clients strip <body> background styling
// and the transparency reveals a white base, making light text invisible.
// See 2026-07-30 bug: reportar_falla llegó ilegible por text-on-white.
const C = {
  bg:     '#120726',  // outer wrapper (solid dark)
  card:   '#1D1141',  // inner body card (solid, slightly lighter)
  cardAccent: '#2A1B5C', // accent variant of card
  border: '#3D2E6A',  // solid border tone (was rgba)
  accent: '#9B6DFF',
  text:   '#F1EEFF',  // primary text (brighter for contrast)
  sub:    '#C8BEE8',  // secondary text (solid, was rgba)
  mute:   '#8C7FB8',  // muted text (solid, still readable on dark)
  header: '#FFFFFF',
};

// ── Meerkat identity ──────────────────────────────────────────────────────────

// Identidad del "empleado digital" que envía el correo. Se usa para inyectar
// avatar + banner de acento arriba del body, y para tintar el CTA con el color
// del rol (Nia lila, Nox teal, Sofía verde, etc). Ver resolveMeerkatFromAgent
// en meerkat-identity.ts para construirlo a partir del voice_agents row.
export interface MeerkatIdentity {
  roleId:   string | null;
  name:     string;
  role:     string;
  color:    string;
  imageUrl: string | null;
}

// Calibración de crop por meerkat (escalada del TeamFlowSection mobile ~54-64px
// al avatar de correo de 56px). Nia/Neo/Nova tienen algo en las manos y su cara
// queda desplazada del centro geométrico; requieren zoom + translate para que
// la cara caiga en el crop circular. Ver [[feedback-meerkat-avatar-crop]] y
// src/app/TeamFlowSection.tsx:29-43 (fuente de verdad de los valores).
interface AvatarCrop {
  objectPosition: string;
  scale:          number;
  shiftX:         number; // px
  shiftY:         number; // px
  transformOrigin: string;
}
const DEFAULT_CROP: AvatarCrop = {
  objectPosition:  'center 3%',
  scale:           1,
  shiftX:          0,
  shiftY:          0,
  transformOrigin: 'center center',
};
const AVATAR_CROP: Record<string, AvatarCrop> = {
  nia:   { objectPosition: 'center 10%', scale: 1.35, shiftX:  8, shiftY: 1, transformOrigin: 'center 12%' },
  noah:  { objectPosition: 'center 3%',  scale: 1.00, shiftX:  0, shiftY: 0, transformOrigin: 'center center' },
  nara:  { objectPosition: 'center 8%',  scale: 1.20, shiftX: -2, shiftY: 3, transformOrigin: 'center 10%' },
  nico:  { objectPosition: 'center 8%',  scale: 1.00, shiftX:  0, shiftY: 2, transformOrigin: 'center center' },
  naia:  { objectPosition: 'center 8%',  scale: 1.00, shiftX:  0, shiftY: 0, transformOrigin: 'center center' },
  nelia: { objectPosition: 'center 8%',  scale: 1.00, shiftX:  0, shiftY: 3, transformOrigin: 'center center' },
  neo:   { objectPosition: 'center 10%', scale: 1.45, shiftX: 11, shiftY: 4, transformOrigin: 'center 12%' },
  nova:  { objectPosition: 'center 5%',  scale: 2.00, shiftX: 17, shiftY: 4, transformOrigin: 'center 12%' },
  nox:   { objectPosition: 'center 8%',  scale: 1.10, shiftX:  0, shiftY: 2, transformOrigin: 'center center' },
  niva:  { objectPosition: 'center 8%',  scale: 1.10, shiftX:  0, shiftY: 2, transformOrigin: 'center center' },
};

export function meerkatHeader(m: MeerkatIdentity): string {
  const tinted = `${m.color}26`; // ~15% opacity in hex — safe for Gmail/Outlook
  const crop = (m.roleId && AVATAR_CROP[m.roleId]) || DEFAULT_CROP;
  const transform = `translate(${crop.shiftX}px, ${crop.shiftY}px) scale(${crop.scale})`;

  const avatar = m.imageUrl
    ? `<div style="width:56px;height:56px;border-radius:50%;overflow:hidden;background:${tinted};display:inline-block;line-height:0">
        <img src="${m.imageUrl}" alt="${m.name}" width="56" height="56" style="width:56px;height:56px;display:block;object-fit:cover;object-position:${crop.objectPosition};transform:${transform};transform-origin:${crop.transformOrigin}">
      </div>`
    : `<div style="width:56px;height:56px;border-radius:50%;background:${tinted};color:${m.color};font-size:22px;font-weight:800;line-height:56px;text-align:center;font-family:Arial,Helvetica,sans-serif">${m.name.charAt(0).toUpperCase()}</div>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px">
    <tr>
      <td width="56" valign="middle" style="width:56px;padding:0 14px 0 0">${avatar}</td>
      <td valign="middle" style="vertical-align:middle">
        <p style="color:${C.text};font-size:15px;font-weight:700;margin:0;line-height:1.3">${m.name}</p>
        <p style="color:${C.mute};font-size:12px;margin:2px 0 0;line-height:1.3">${m.role}</p>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:16px 0 0"><div style="height:1px;background:${m.color}33;line-height:1px;font-size:0">&nbsp;</div></td>
    </tr>
  </table>`;
}

// ── Shell ─────────────────────────────────────────────────────────────────────

// Exported so ad-hoc emails outside this file (heartbeat cron, quota-email,
// onboarding submit) can use the same dark-mode-resistant wrapper instead of
// hand-rolling inline HTML that breaks in Gmail/Titan.
export function shell(body: string, opts?: {
  meerkat?:   MeerkatIdentity;
  preheader?: string;
}) {
  const preheader = opts?.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.bg};opacity:0">${opts.preheader}</div>`
    : '';
  const header = opts?.meerkat ? meerkatHeader(opts.meerkat) : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <style>
    /* Force white on header even when mobile clients apply dark-mode
       conversion (Titan Mobile, Gmail iOS, Outlook.com, etc). */
    .force-white { background: #FFFFFF !important; background-color: #FFFFFF !important; }
    @media (prefers-color-scheme: dark) {
      .force-white { background: #FFFFFF !important; background-color: #FFFFFF !important; }
    }
    [data-ogsc] .force-white { background: #FFFFFF !important; background-color: #FFFFFF !important; }
    [data-ogsb] .force-white { background: #FFFFFF !important; background-color: #FFFFFF !important; }
    u + .body .force-white { background: #FFFFFF !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif">
  ${preheader}
  <!-- Outer wrapper table — bgcolor survives Gmail/Titan style stripping -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg};margin:0;padding:0">
    <tr>
      <td align="center" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg};padding:32px 16px 48px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%">

          <!-- Header blanco (triple-wrapped anti-dark-mode) -->
          <tr>
            <td class="force-white" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" class="force-white" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0">
                <tr>
                  <td class="force-white" align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;padding:20px 32px">
                    <div class="force-white" style="background:#FFFFFF;background-color:#FFFFFF;padding:0;margin:0">
                      <img src="${LOGO_URL}" alt="Centinelia" width="230" height="89" style="width:230px;height:auto;display:inline-block;background:#FFFFFF;background-color:#FFFFFF">
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body oscuro (solid bg via table + bgcolor) -->
          <tr>
            <td bgcolor="${C.card}" style="background:${C.card};background-color:${C.card};border-radius:0 0 16px 16px;padding:32px">
              ${header}
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg};padding:24px 0 0">
              <p style="color:${C.mute};font-size:12px;line-height:1.8;margin:0">
                <a href="https://www.centinelia.mx" style="color:${C.mute};text-decoration:none">centinelia.mx</a>
                &nbsp;·&nbsp;
                <a href="mailto:hola@centinelia.mx" style="color:${C.accent};text-decoration:none">hola@centinelia.mx</a>
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

// ── Helpers ───────────────────────────────────────────────────────────────────

export function badge(label: string, color = C.accent) {
  return `<div style="text-align:center;margin-bottom:20px">
    <span style="display:inline-block;background:${color}22;border:1px solid ${color}40;border-radius:20px;padding:6px 16px;color:${color};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${label}</span>
  </div>`;
}

export function heading(title: string, sub?: string) {
  // Sub en 15px semibold sobre C.text: el business_name suele ir como sub y
  // necesita presencia editorial, no un muted 13px que desaparece.
  return `<h1 style="color:${C.text};font-size:22px;font-weight:700;margin:0 0 ${sub ? '8px' : '24px'};text-align:center;line-height:1.3">${title}</h1>
  ${sub ? `<p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 24px;text-align:center;line-height:1.4">${sub}</p>` : ''}`;
}

export function infoCard(content: string, accent = false) {
  const bg = accent ? '#3A2570' : C.cardAccent;  // SOLID — nested cards need solid bg to stay readable
  const bd = accent ? '#5A3AA0' : C.border;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${bg}" style="background:${bg};background-color:${bg};border:1px solid ${bd};border-radius:12px;margin-bottom:16px">
    <tr><td bgcolor="${bg}" style="background:${bg};background-color:${bg};padding:20px">
      ${content}
    </td></tr>
  </table>`;
}

// Lighten a #RRGGBB hex by ~25% for the gradient's second stop.
function lightenHex(hex: string, amt = 0.25): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amt));
  const hx = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hx(mix(r))}${hx(mix(g))}${hx(mix(b))}`;
}

// btn(label, href) → primary con acento default
// btn(label, href, false) → secundario (retro-compat, boolean)
// btn(label, href, { color, primary }) → forma extendida con color custom
export function btn(label: string, href: string, opts: boolean | { primary?: boolean; color?: string } = true) {
  const norm = typeof opts === 'boolean' ? { primary: opts } : opts;
  const primary = norm.primary !== false;
  const color = norm.color ?? '#6C3BFF';
  const grad = `linear-gradient(135deg,${color},${lightenHex(color)})`;
  return `<div style="text-align:center;margin:24px 0 8px">
    <a href="${href}" style="display:inline-block;background:${primary ? grad : 'transparent'};background-color:${primary ? color : 'transparent'};border:${primary ? 'none' : `1.5px solid ${C.border}`};color:${primary ? '#fff' : C.sub};font-size:14px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px">${label}</a>
  </div>`;
}

// Barra de progreso reutilizable (weeklyReport, minutesAlert, y otros que muestren % de consumo).
export function progressBar(pct: number, color?: string): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const c = color ?? (p >= 100 ? '#F87171' : p >= 80 ? '#FBBF24' : C.accent);
  return `<div style="background:rgba(255,255,255,0.10);border-radius:6px;height:10px;overflow:hidden">
    <div style="height:10px;width:${p}%;background:${c};border-radius:6px;line-height:10px;font-size:0">&nbsp;</div>
  </div>`;
}

export function sectionLabel(text: string) {
  return `<p style="color:${C.mute};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">${text}</p>`;
}

function statPill(label: string, color: string) {
  return `<span style="display:inline-block;background:${color}22;color:${color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;letter-spacing:0.05em;text-transform:uppercase">${label}</span>`;
}

// ── Markdown → email-friendly HTML ────────────────────────────────────────────

// Rendering markdown output from an LLM into HTML that survives Gmail/Outlook.
// Uses `marked` (sync mode) + inline styles per element to survive email clients
// stripping <head> and <style> blocks. Preserves list bullets, headings, bold,
// italic, links, code blocks, and blockquotes with the Centinelia dark palette.
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

const MD_STYLE_MAP: Record<string, string> = {
  h1:         `color:${C.text};font-size:20px;font-weight:700;line-height:1.3;margin:16px 0 12px`,
  h2:         `color:${C.text};font-size:17px;font-weight:700;line-height:1.4;margin:20px 0 10px`,
  h3:         `color:${C.text};font-size:15px;font-weight:600;line-height:1.4;margin:18px 0 8px`,
  h4:         `color:${C.sub};font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin:16px 0 6px`,
  p:          `color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 12px`,
  ul:         `color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 12px;padding-left:22px`,
  ol:         `color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 12px;padding-left:22px`,
  li:         `margin:0 0 4px`,
  strong:     `color:${C.text};font-weight:700`,
  em:         `color:${C.sub};font-style:italic`,
  a:          `color:${C.accent};text-decoration:underline`,
  hr:         `border:none;border-top:1px solid ${C.border};margin:16px 0`,
  blockquote: `border-left:3px solid ${C.accent};padding:4px 12px;margin:0 0 12px;color:${C.sub};font-style:italic`,
  code:       `background:rgba(255,255,255,0.06);color:${C.text};padding:2px 5px;border-radius:4px;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px`,
  pre:        `background:rgba(255,255,255,0.04);border:1px solid ${C.border};padding:12px;border-radius:8px;overflow-x:auto;margin:0 0 12px;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;color:${C.text};white-space:pre-wrap`,
};

/**
 * Convierte markdown a HTML con inline styles listos para email clients.
 * Uso: contenido generado por LLMs que viene en markdown y debe renderizarse
 * en emails (heartbeat check-in, weekly insights, etc.).
 */
export function mdToEmailHtml(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  // Aplica estilo inline a cada tag conocido. Los clientes de email strippean
  // <style> blocks, entonces cada tag necesita su style="..." embebido.
  return raw.replace(/<(h[1-6]|p|ul|ol|li|strong|em|a|hr|blockquote|code|pre)(\s[^>]*)?>/gi, (m, tag: string, rest = '') => {
    const style = MD_STYLE_MAP[tag.toLowerCase()];
    if (!style) return m;
    // Si ya tiene style=, no lo pisamos (ej. <a href="..." style="...">). Anexamos.
    if (/style\s*=/.test(rest)) {
      return `<${tag}${rest.replace(/style\s*=\s*"([^"]*)"/i, `style="$1;${style}"`)}>`;
    }
    return `<${tag}${rest} style="${style}">`;
  });
}

// ── sendEmail ─────────────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to:           string;
  subject:      string;
  html:         string;
  from?:        string;
  replyTo?:     string;
  attachments?: { filename: string; content: string }[]; // content = base64
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('Email not configured, missing RESEND_API_KEY'); return false; }

  const payload: Record<string, unknown> = {
    from:    opts.from ?? FROM,
    to:      [opts.to],
    subject: opts.subject,
    html:    opts.html,
  };
  if (opts.replyTo) payload.reply_to = [opts.replyTo];
  if (opts.attachments?.length) payload.attachments = opts.attachments;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
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
    ${progressBar(pct, barColor)}
    <p style="color:${C.sub};font-size:13px;margin:10px 0 0">${opts.minutesUsed} de ${opts.minutesTotal} min usados <span style="color:${C.mute}">(${pct}%)</span></p>
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
    ${heading('Tu empleado estará listo pronto', opts.businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Tu pago fue procesado exitosamente. En las próximas horas asignaremos tu número de teléfono dedicado y te avisaremos por WhatsApp cuando tu empleado esté en línea.
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
    ${heading(opts.businessName, 'Tu empleado capturó nueva actividad')}
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
    ? `Se agotaron los ${opts.included} minutos del ciclo. <strong style="color:#F87171">Tu oficina fue pausada</strong> y tus empleados no pueden recibir ni hacer más llamadas hasta que compres minutos adicionales o amplíes tu plan. Las tareas de oficina siguen funcionando.`
    : `Tu oficina lleva <strong style="color:#FBBF24">${opts.used} de ${opts.included} minutos</strong> del ciclo. Si tus empleados agotan el resto antes del ${opts.resetDate}, dejarán de recibir y hacer llamadas hasta el próximo ciclo. Puedes comprar minutos adicionales o ampliar tu plan.`;

  return shell(`
    ${badge(isPaused ? 'Oficina pausada' : `${Math.round(opts.pct)}% de minutos usados`, alertColor)}
    ${heading(opts.businessName)}
    ${infoCard(`
      ${sectionLabel('Consumo del plan')}
      ${progressBar(opts.pct, alertColor)}
      <p style="color:${C.sub};font-size:13px;margin:10px 0 0"><strong style="color:${C.text}">${opts.used}</strong> de ${opts.included} min <span style="color:${alertColor};font-weight:700">· ${Math.round(opts.pct)}%</span></p>
      <p style="color:${C.mute};font-size:12px;margin:6px 0 0">Se renueva el ${opts.resetDate}</p>
    `, true)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:20px 0 24px">${bodyText}</p>
    ${btn('Comprar más minutos →', `${opts.portalUrl}?tab=cuenta`)}
    ${btn('Ampliar mi plan →', `${opts.portalUrl}?tab=cuenta#suscripcion`, false)}
  `);
}

// ── Agent paused ──────────────────────────────────────────────────────────────

export function agentPausedHtml(businessName: string) {
  return shell(`
    ${badge('Oficina pausada', '#F87171')}
    ${heading(businessName)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0">
      El período de gracia de 3 días venció sin recibir el pago de tu suscripción Centinelia.
      <strong style="color:${C.text}">Tu oficina fue pausada</strong> y tus empleados no pueden recibir llamadas ni completar tareas hasta que el pago se regularice.
      Actualiza tu método de pago desde el portal o escríbenos a
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
      Tienes <strong style="color:${C.text}">3 días</strong> para actualizar tu método de pago antes de que tu oficina se pause automáticamente y tus empleados dejen de trabajar.
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

// ── Reauth required ──────────────────────────────────────────────────────────

export function reauthRequiredHtml(opts: {
  businessName: string;
  provider:     'gmail' | 'outlook';
  email:        string;
  lastSyncAt:   string | null;
  portalUrl:    string;
}) {
  const providerLabel = opts.provider === 'gmail' ? 'Gmail' : 'Outlook';

  const daysSinceSync = opts.lastSyncAt
    ? Math.floor((Date.now() - new Date(opts.lastSyncAt).getTime()) / 86_400_000)
    : null;

  const syncNote = daysSinceSync !== null
    ? `<p style="color:#f59e0b;font-size:13px;font-weight:600;margin:0 0 20px;text-align:center">
        Sin sincronizar desde hace ${daysSinceSync === 1 ? '1 día' : `${daysSinceSync} días`}
       </p>`
    : '';

  return shell(`
    ${badge('Accion requerida', '#f59e0b')}
    ${heading(opts.businessName, `Tu correo de ${providerLabel} perdio la conexion`)}
    ${syncNote}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 12px">
      Google y Microsoft retiran el acceso periodicamente por razones de seguridad. No significa que hiciste algo mal, simplemente hay que volver a autorizar.
    </p>
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 24px">
      Hasta que reconectes <strong style="color:${C.text}">${opts.email}</strong>, tu empleado no puede acceder a los correos.
    </p>
    ${btn(`Reconectar ${providerLabel} →`, `${opts.portalUrl}?tab=integraciones`)}
    <p style="color:${C.mute};font-size:12px;text-align:center;margin:24px 0 0;line-height:1.6">
      Toma menos de 30 segundos. En el portal ve a <strong style="color:${C.sub}">Integraciones → Correo</strong> y haz clic en Reconectar.
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

// ── Infra alert (internal — sent to hola@centinelia.mx) ──────────────────────

export function infraAlertHtml(opts: {
  date:    string;
  alerts:  { service: string; current: string; threshold: string; action: string; actionUrl: string; color: string }[];
}): string {
  const rows = opts.alerts.map(a => `
    <div style="background:${a.color}0D;border:1px solid ${a.color}33;border-radius:12px;padding:18px 20px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="color:${C.text};font-size:14px;font-weight:700">${a.service}</span>
        <span style="color:${a.color};font-size:12px;font-weight:700;background:${a.color}22;padding:3px 10px;border-radius:20px">ALERTA</span>
      </div>
      <p style="color:${C.sub};font-size:13px;margin:0 0 4px">Actual: <strong style="color:${C.text}">${a.current}</strong></p>
      <p style="color:${C.mute};font-size:12px;margin:0 0 12px">Umbral: ${a.threshold}</p>
      <a href="${a.actionUrl}" style="color:${C.accent};font-size:13px;font-weight:600;text-decoration:none">${a.action} →</a>
    </div>`).join('');

  return shell(`
    ${badge('Alerta de infraestructura', '#ef4444')}
    ${heading('Acción requerida', opts.date)}
    <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0 0 20px;text-align:center">
      Uno o más servicios de Centinelia requieren atención. Revisa y recarga antes de que afecte el servicio.
    </p>
    ${rows}
    ${btn('Ver dashboard →', 'https://www.centinelia.mx/admin/dashboard')}
  `);
}

// ── Bug report ────────────────────────────────────────────────────────────────

export function bugReportHtml(opts: {
  businessName:  string;
  reporterName:  string;
  reporterEmail: string;
  category:      string;
  description:   string;
}): string {
  return shell(
    badge('Reporte de falla', '#ef4444') +
    heading('Nueva falla reportada', opts.businessName) +
    infoCard(`
      ${sectionLabel('Reportado por')}
      <p style="color:${C.text};font-size:14px;font-weight:600;margin:0 0 2px">${opts.reporterName}</p>
      <p style="color:${C.sub};font-size:13px;margin:0">${opts.reporterEmail}</p>
    `) +
    infoCard(`
      ${sectionLabel('Categoría')}
      <p style="color:${C.text};font-size:14px;margin:0">${opts.category}</p>
    `) +
    infoCard(`
      ${sectionLabel('Descripción')}
      <p style="color:${C.text};font-size:14px;margin:0;line-height:1.7;white-space:pre-wrap">${opts.description}</p>
    `, true)
  );
}

// ── Compliance enforcement emails ─────────────────────────────────────────────

export function accountWarningHtml(opts: {
  clientName:   string;
  businessName: string;
  reason:       string;
  portalUrl:    string;
}): string {
  return shell(
    badge('Aviso de cumplimiento', '#D97706') +
    heading('Aviso importante sobre tu cuenta', `${opts.businessName} · Centinelia`) +
    `<p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 20px">
      Hola ${opts.clientName},
    </p>
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Nuestro equipo detectó actividad en tu cuenta que podría estar en conflicto con nuestra <strong style="color:${C.text}">Política de Uso Aceptable</strong>.
    </p>` +
    infoCard(`
      ${sectionLabel('Motivo del aviso')}
      <p style="color:${C.text};font-size:14px;margin:0;line-height:1.7">${opts.reason}</p>
    `, true) +
    `<p style="color:${C.sub};font-size:14px;line-height:1.7;margin:16px 0">
      Si crees que esto es un error o quieres aclarar la situación, responde a este correo o escríbenos a
      <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF">hola@centinelia.mx</a> en las próximas <strong style="color:${C.text}">48 horas</strong>.
    </p>
    <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0 0 20px">
      En caso de reincidencia o falta de respuesta, la cuenta podrá ser suspendida de forma temporal o permanente.
    </p>` +
    btn('Ir a mi portal', opts.portalUrl)
  );
}

export function accountSuspendedHtml(opts: {
  clientName:   string;
  businessName: string;
  reason:       string;
  until:        string | null;
}): string {
  const durationLine = opts.until
    ? `<p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">La suspensión es <strong style="color:${C.text}">temporal</strong> y se levantará automáticamente el <strong style="color:${C.text}">${opts.until}</strong>.</p>`
    : `<p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">La suspensión es <strong style="color:#ef4444">indefinida</strong> hasta que el equipo de Centinelia la levante.</p>`;

  return shell(
    badge('Cuenta suspendida', '#DC2626') +
    heading('Tu cuenta ha sido suspendida', opts.businessName) +
    `<p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 16px">Hola ${opts.clientName},</p>` +
    infoCard(`
      ${sectionLabel('Motivo')}
      <p style="color:${C.text};font-size:14px;margin:0;line-height:1.7">${opts.reason}</p>
    `, true) +
    durationLine +
    `<p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0">
      Si consideras que esta suspensión es un error, escríbenos a
      <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF">hola@centinelia.mx</a>.
    </p>`
  );
}

export function accountTerminatedHtml(opts: {
  clientName:   string;
  businessName: string;
  reason:       string;
}): string {
  return shell(
    badge('Contrato rescindido', '#7f1d1d') +
    heading('Tu contrato ha sido rescindido', opts.businessName) +
    `<p style="color:${C.text};font-size:14px;line-height:1.7;margin:0 0 16px">Hola ${opts.clientName},</p>
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Lamentamos informarte que, como resultado de infracciones reiteradas a nuestra Política de Uso Aceptable, hemos procedido a rescindir el contrato de todos los empleados activos en tu cuenta de Centinelia.
    </p>` +
    infoCard(`
      ${sectionLabel('Motivo de rescisión')}
      <p style="color:${C.text};font-size:14px;margin:0;line-height:1.7">${opts.reason}</p>
    `, true) +
    `<p style="color:${C.sub};font-size:13px;line-height:1.7;margin:16px 0 0">
      Si tienes preguntas sobre esta decisión, puedes contactarnos en
      <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF">hola@centinelia.mx</a>.
    </p>`
  );
}
