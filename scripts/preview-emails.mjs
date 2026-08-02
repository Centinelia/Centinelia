// Preview standalone de todos los templates de correo rediseñados.
// Duplica los helpers de src/lib/email/send.ts para no depender de tsx.
// Uso: node scripts/preview-emails.mjs   → escribe .email-previews/*.html
//                                          e index.html con grid de iframes
//                                          para abrir en el navegador.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '.email-previews';
const LOGO_URL = 'https://www.centinelia.mx/logo-tagline.png';
const BASE_URL = 'https://www.centinelia.mx';

const C = {
  bg:         '#120726',
  card:       '#1D1141',
  cardAccent: '#2A1B5C',
  border:     '#3D2E6A',
  accent:     '#9B6DFF',
  text:       '#F1EEFF',
  sub:        '#C8BEE8',
  mute:       '#8C7FB8',
};

// ── Helpers (mirrors send.ts) ────────────────────────────────────────────────

function lightenHex(hex, amt = 0.25) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = c => Math.min(255, Math.round(c + (255 - c) * amt));
  const hx = n => n.toString(16).padStart(2, '0');
  return `#${hx(mix(r))}${hx(mix(g))}${hx(mix(b))}`;
}

const AVATAR_CROP = {
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
const DEFAULT_CROP = { objectPosition: 'center 3%', scale: 1, shiftX: 0, shiftY: 0, transformOrigin: 'center center' };

function meerkatHeader(m) {
  const tinted = `${m.color}26`;
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

function shell(body, opts = {}) {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.bg};opacity:0">${opts.preheader}</div>`
    : '';
  const header = opts.meerkat ? meerkatHeader(opts.meerkat) : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <style>.force-white{background:#FFFFFF !important;background-color:#FFFFFF !important;}</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif">
  ${preheader}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg};margin:0;padding:0">
    <tr>
      <td align="center" bgcolor="${C.bg}" style="background:${C.bg};padding:32px 16px 48px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%">
          <tr>
            <td class="force-white" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px 16px 0 0">
                <tr>
                  <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;padding:20px 32px">
                    <img src="${LOGO_URL}" alt="Centinelia" width="230" height="89" style="width:230px;height:auto;display:inline-block">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="${C.card}" style="background:${C.card};border-radius:0 0 16px 16px;padding:32px">
              ${header}
              ${body}
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="${C.bg}" style="background:${C.bg};padding:24px 0 0">
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

function badge(label, color = C.accent) {
  return `<div style="text-align:center;margin-bottom:20px">
    <span style="display:inline-block;background:${color}22;border:1px solid ${color}40;border-radius:20px;padding:6px 16px;color:${color};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${label}</span>
  </div>`;
}

function heading(title, sub) {
  return `<h1 style="color:${C.text};font-size:22px;font-weight:700;margin:0 0 ${sub ? '8px' : '24px'};text-align:center;line-height:1.3">${title}</h1>
  ${sub ? `<p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 24px;text-align:center;line-height:1.4">${sub}</p>` : ''}`;
}

function infoCard(content, accent = false) {
  const bg = accent ? '#3A2570' : C.cardAccent;
  const bd = accent ? '#5A3AA0' : C.border;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${bg}" style="background:${bg};border:1px solid ${bd};border-radius:12px;margin-bottom:16px">
    <tr><td bgcolor="${bg}" style="background:${bg};padding:20px">${content}</td></tr>
  </table>`;
}

function btn(label, href, opts = true) {
  const norm = typeof opts === 'boolean' ? { primary: opts } : opts;
  const primary = norm.primary !== false;
  const color = norm.color ?? '#6C3BFF';
  const grad = `linear-gradient(135deg,${color},${lightenHex(color)})`;
  return `<div style="text-align:center;margin:24px 0 8px">
    <a href="${href}" style="display:inline-block;background:${primary ? grad : 'transparent'};background-color:${primary ? color : 'transparent'};border:${primary ? 'none' : `1.5px solid ${C.border}`};color:${primary ? '#fff' : C.sub};font-size:14px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px">${label}</a>
  </div>`;
}

function sectionLabel(text) {
  return `<p style="color:${C.mute};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">${text}</p>`;
}

function progressBar(pct, color) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const c = color ?? (p >= 100 ? '#F87171' : p >= 80 ? '#FBBF24' : C.accent);
  return `<div style="background:rgba(255,255,255,0.10);border-radius:6px;height:10px;overflow:hidden">
    <div style="height:10px;width:${p}%;background:${c};border-radius:6px;line-height:10px;font-size:0">&nbsp;</div>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Meerkat identities (mocks) ───────────────────────────────────────────────

const NIA = {
  roleId:   'nia',
  name:     'Nia',
  role:     'Empleado digital · Recepcionista',
  color:    '#6C3BFF',
  imageUrl: `${BASE_URL}/meerkats/nia.png`,
};
const NOAH = {
  roleId:   'noah',
  name:     'Noah',
  role:     'Empleado digital · Ventas',
  color:    '#22c55e',
  imageUrl: `${BASE_URL}/meerkats/noah.png`,
};
const NOX = {
  roleId:   'nox',
  name:     'Nox',
  role:     'Empleado digital · Director',
  color:    '#0d9488',
  imageUrl: `${BASE_URL}/meerkats/nox.png`,
};
const NEO = {
  roleId:   'neo',
  name:     'Neo',
  role:     'Empleado digital · Operaciones',
  color:    '#06b6d4',
  imageUrl: `${BASE_URL}/meerkats/neo.png`,
};
const NOVA = {
  roleId:   'nova',
  name:     'Nova',
  role:     'Empleado digital · Despacho',
  color:    '#ef4444',
  imageUrl: `${BASE_URL}/meerkats/nova.png`,
};
const CUSTOM_SOFIA = {
  roleId:   null,
  name:     'Sofía',
  role:     'Empleado digital',
  color:    '#6C3BFF',
  imageUrl: null, // fallback monograma
};

// ── Templates ────────────────────────────────────────────────────────────────

function requestEmail() {
  const meerkat = NOAH;
  return shell(
    `${badge('Urgencia alta', '#EF4444')}
    ${heading('Necesito tu ayuda', 'Distribuidora Cerro Verde · Necesito una acción')}
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">Prospecto ALTO: Distribuidora Cerro Verde - Ecommerce B2B + SAP Integration</p>
      <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap">Cliente: Distribuidora Cerro Verde SA de CV, Monterrey
Contacto: Miguel Estrada, Director de Tecnología

PERFIL DEL PROYECTO (complejidad ALTA):
- 3,500 SKUs con precios diferenciados por tipo de cliente
- Integración en tiempo real con SAP Business One
- Portal de credito B2B con historial y estados de cuenta
- Presupuesto APROBADO, urgencia de ESTE MES

INFORMACIÓN NECESARIA:
1. ¿Tenemos experiencia documentada con integraciones SAP Business One?
2. ¿Cuál es el rango de inversión típico que podemos mencionar?
3. ¿Podemos confirmar que el timeline solicitado (MVP 3 meses) es factible?</p>
    `, true)}
    ${btn('Responder ahora →', 'https://www.centinelia.mx/portal/xyz/requests/abc', { color: meerkat.color })}
    <p style="color:${C.mute};font-size:12px;line-height:1.6;text-align:center;margin:16px 0 0">
      Puedes responder este correo directamente y tu respuesta quedará registrada en la solicitud.
    </p>`,
    { meerkat, preheader: 'Noah: Prospecto ALTO Distribuidora Cerro Verde' },
  );
}

function reminderEmail() {
  const meerkat = CUSTOM_SOFIA;
  return shell(
    `${badge('Recordatorio · 24 horas', '#FBBF24')}
    ${heading('Sigo esperando tu respuesta', 'Distribuidora Cerro Verde')}
    ${infoCard(`
      ${sectionLabel('Solicitud pendiente')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0;line-height:1.4">Prospecto ALTO: Distribuidora Cerro Verde - Ecommerce B2B + SAP Integration</p>
    `, true)}
    ${btn('Responder ahora →', 'https://www.centinelia.mx/portal/xyz/requests/abc', { color: '#FBBF24' })}`,
    { meerkat, preheader: 'Recordatorio pendiente' },
  );
}

function escalationEmail() {
  const meerkat = NIA;
  return shell(
    `${badge('Escalado · 48h sin respuesta', '#EF4444')}
    ${heading('Necesito respuesta', 'Clínica Norte')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      La solicitud original fue enviada a <strong style="color:${C.text}">recepcion@clinica-norte.mx</strong> hace 48 horas sin respuesta.
    </p>
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">Confirmar disponibilidad Dr. García el jueves</p>
      <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0">Paciente pidió agendar con el Dr. García para jueves 6 en la mañana. Necesito confirmar disponibilidad antes de agendar.</p>
    `, true)}
    ${btn('Responder ahora →', 'https://www.centinelia.mx/portal/xyz/requests/abc', { color: '#EF4444' })}`,
    { meerkat, preheader: 'Escalado a manager' },
  );
}

function spamDigestEmail() {
  const meerkat = CUSTOM_SOFIA;
  const items = [
    { subject: 'Create advanced Excel models with ChatGPT Work', from: 'hi@mail.acbe.com', summary: 'Correo de marketing (clasificado en IA: envío masivo) con cuerpo promocional.' },
    { subject: 'Tu boletín exclusivo de July de Crown & Anchor ya está aquí', from: 'Royal Caribbean Intl. <rwc@rewards.royalcaribbean.com>', summary: 'Newsletter promocional de miembros del programa Crown & Anchor. No requiere acción del equipo.' },
    { subject: 'Los próximos kilómetros empiezan aquí.', from: 'MR Shoes <support@mrshoesaccessories.com>', summary: 'Email promocional. No requiere acción del equipo.' },
    { subject: '$10 Express Cash | Two days only! BOGO FREE all dresses', from: 'Express <wemove@e.express.com>', summary: 'Correo promocional de tienda de ropa anunciando descuento BOGO. No es proveedor de negocio.' },
  ];
  const itemsHtml = items.map(it => infoCard(`
    <p style="color:${C.text};font-size:14px;font-weight:600;margin:0 0 4px;line-height:1.35">${escapeHtml(it.subject)}</p>
    <p style="color:${C.mute};font-size:12px;margin:0 0 8px">De: ${escapeHtml(it.from)}</p>
    <p style="color:${C.sub};font-size:13px;line-height:1.6;margin:0">${escapeHtml(it.summary)}</p>
  `)).join('');

  return shell(
    `${badge('Revisar por si acaso', meerkat.color)}
    ${heading(`${items.length} correos sospechosos`, 'Distribuidora Cerro Verde')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 20px;text-align:center">
      Marqué estos como spam pero podrían ser leads reales o correos legítimos. Rescátalos desde la bandeja si me equivoqué.
    </p>
    ${itemsHtml}
    ${btn('Ver bandeja de spam →', 'https://www.centinelia.mx/portal/xyz/oficina/bandeja?tab=spam', { color: meerkat.color })}
    <p style="color:${C.mute};font-size:11px;line-height:1.5;margin:20px 0 0;text-align:center">
      Filtro: solo correos con más de 500 caracteres. Los promocionales cortos ya se descartaron.
    </p>`,
    { meerkat, preheader: `${items.length} correos marcados spam para revisión` },
  );
}

function neoTestEmail() {
  const meerkat = NEO;
  return shell(
    `${badge('Urgencia media', '#FBBF24')}
    ${heading('Necesito tu ayuda', 'Corporativo XYZ · Necesito información')}
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">Ticket #1247: laptop no prende después de la actualización</p>
      <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0">El usuario Miguel Estrada reporta que su laptop dejó de prender después de la actualización de Windows del martes. Necesito confirmar si hay reemplazo disponible en inventario.</p>
    `, true)}
    ${btn('Responder ahora →', 'https://www.centinelia.mx/portal/xyz/requests/abc', { color: meerkat.color })}`,
    { meerkat, preheader: 'Neo: Ticket #1247 laptop no prende' },
  );
}

function novaTestEmail() {
  const meerkat = NOVA;
  return shell(
    `${badge('Urgencia alta', '#EF4444')}
    ${heading('Necesito despachar unidad', 'Servicios Emergencia SA')}
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">Zona Poniente: unidad más cercana a 12 min</p>
      <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0">Llamada entrante solicita servicio urgente en Calle Constitución 234. La unidad más cercana está a 12 min. Necesito autorización para despachar unidad 47.</p>
    `, true)}
    ${btn('Autorizar despacho →', 'https://www.centinelia.mx/portal/xyz/requests/abc', { color: meerkat.color })}`,
    { meerkat, preheader: 'Nova: despacho urgente Zona Poniente' },
  );
}

function autoModeDigestEmail() {
  const meerkat = NIA;
  const items = [
    { subject: 'Consulta sobre horario del sábado', from: 'ana@example.com', summary: 'Cliente pregunta si abrimos el sábado. Respondí con horarios habituales.' },
    { subject: 'Re: Cotización presupuesto', from: 'luis@corp.mx', summary: 'Cliente confirmó recibir cotización. Sin acción adicional requerida.' },
  ];
  const itemsHtml = items.map(it => infoCard(`
    <p style="color:${C.text};font-size:14px;font-weight:600;margin:0 0 4px;line-height:1.35">${escapeHtml(it.subject)}</p>
    <p style="color:${C.mute};font-size:12px;margin:0 0 8px">De: ${escapeHtml(it.from)}</p>
    <p style="color:${C.sub};font-size:13px;line-height:1.6;margin:0">${escapeHtml(it.summary)}</p>
  `)).join('');

  return shell(
    `${badge('Modo auto', meerkat.color)}
    ${heading(`Respondí ${items.length} correos`, 'Clínica Norte')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 20px;text-align:center">
      Estos correos se enviaron sin necesitar tu aprobación. Si alguno no debió enviarse, márcalo desde el portal.
    </p>
    ${itemsHtml}
    ${btn('Ver correos auto-enviados →', 'https://www.centinelia.mx/portal/xyz/oficina/bandeja?tab=auto', { color: meerkat.color })}`,
    { meerkat, preheader: 'Nia respondió 2 correos' },
  );
}

function minutesAlertEmail(pct = 82) {
  const isPaused = pct >= 100;
  const alertColor = isPaused ? '#F87171' : '#FBBF24';
  const used = Math.round(pct * 10);
  const bodyText = isPaused
    ? `Se agotaron los 1000 minutos del ciclo. <strong style="color:#F87171">Tu oficina fue pausada</strong> y tus empleados no pueden recibir ni hacer más llamadas hasta que compres minutos adicionales o amplíes tu plan. Las tareas de oficina siguen funcionando.`
    : `Tu oficina lleva <strong style="color:#FBBF24">${used} de 1000 minutos</strong> del ciclo. Si tus empleados agotan el resto antes del 15 de agosto, dejarán de recibir y hacer llamadas hasta el próximo ciclo. Puedes comprar minutos adicionales o ampliar tu plan.`;
  return shell(`
    ${badge(isPaused ? 'Oficina pausada' : `${pct}% de minutos usados`, alertColor)}
    ${heading('Distribuidora Cerro Verde')}
    ${infoCard(`
      ${sectionLabel('Consumo del plan')}
      ${progressBar(pct, alertColor)}
      <p style="color:${C.sub};font-size:13px;margin:10px 0 0"><strong style="color:${C.text}">${Math.round(pct * 10)}</strong> de 1000 min <span style="color:${alertColor};font-weight:700">· ${pct}%</span></p>
      <p style="color:${C.mute};font-size:12px;margin:6px 0 0">Se renueva el 15 de agosto</p>
    `, true)}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:20px 0 24px">${bodyText}</p>
    ${btn('Comprar más minutos →', 'https://www.centinelia.mx/portal/xyz?tab=cuenta')}
    ${btn('Ampliar mi plan →', 'https://www.centinelia.mx/portal/xyz?tab=cuenta#suscripcion', false)}
  `);
}

function welcomeEmail() {
  return shell(`
    ${badge('Bienvenido a Centinelia', '#9B6DFF')}
    ${heading('Tu empleado estará listo pronto', 'Clínica Norte')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 16px">
      Tu pago fue procesado exitosamente. En las próximas horas asignaremos tu número de teléfono dedicado y te avisaremos por WhatsApp cuando tu empleado esté en línea.
    </p>
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 24px">
      Mientras tanto, configura tu acceso al portal para monitorear tus llamadas, leads y minutos:
    </p>
    ${btn('Acceder a mi portal →', 'https://www.centinelia.mx/portal/xyz')}
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

function agentPausedEmail() {
  return shell(`
    ${badge('Oficina pausada', '#F87171')}
    ${heading('Clínica Norte')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0">
      El período de gracia de 3 días venció sin recibir el pago de tu suscripción Centinelia.
      <strong style="color:${C.text}">Tu oficina fue pausada</strong> y tus empleados no pueden recibir llamadas ni completar tareas hasta que el pago se regularice.
      Actualiza tu método de pago desde el portal o escríbenos a
      <a href="mailto:hola@centinelia.mx" style="color:${C.accent};text-decoration:none">hola@centinelia.mx</a>.
    </p>
  `);
}

function paymentFailedEmail() {
  return shell(`
    ${badge('Pago fallido', '#F87171')}
    ${heading('Clínica Norte')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0">
      No pudimos procesar el pago de tu suscripción Centinelia.<br><br>
      Tienes <strong style="color:${C.text}">3 días</strong> para actualizar tu método de pago antes de que tu oficina se pause automáticamente y tus empleados dejen de trabajar.
    </p>
  `);
}

function onboardingWelcomeEmail() {
  const steps = [
    'Sube tu identificación oficial (INE o pasaporte)',
    'Completa el formulario de datos personales',
    'Firma el contrato digital',
    'Toma tu foto para el gafete',
  ];
  const stepsHtml = steps.map((s, i) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px">
      <tr>
        <td width="28" valign="top" style="width:28px;padding:2px 12px 0 0">
          <div style="width:24px;height:24px;border-radius:50%;background:#3A2570;color:#9B6DFF;font-size:11px;font-weight:800;line-height:24px;text-align:center">${i + 1}</div>
        </td>
        <td valign="top">
          <p style="color:${C.text};font-size:13px;line-height:1.6;margin:0">${s}</p>
        </td>
      </tr>
    </table>`).join('');
  return shell(
    `${badge('Onboarding', '#22C55E')}
    ${heading('Bienvenido, Miguel', 'Corporativo XYZ · Onboarding empleado nuevo')}
    <p style="color:${C.sub};font-size:14px;line-height:1.7;margin:0 0 20px">
      Estamos muy contentos de que formes parte de <strong style="color:${C.text}">Corporativo XYZ</strong>. A continuación encontrarás los pasos de tu proceso de incorporación.
    </p>
    ${infoCard(`
      ${sectionLabel('Pasos del proceso')}
      ${stepsHtml}
    `, true)}
    ${btn('Completar mi onboarding →', 'https://www.centinelia.mx/onboarding/xyz')}`,
    { preheader: 'Bienvenido a Corporativo XYZ' },
  );
}

// ── Render ───────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

const templates = [
  { id: 'request',            title: 'Request Noah (centrado natural)', html: requestEmail() },
  { id: 'request-nia',        title: 'Request Nia (zoom + shift right)', html: (() => {
      const meerkat = NIA;
      return shell(
        `${badge('Urgencia media', '#FBBF24')}
        ${heading('Necesito tu ayuda', 'Clínica Norte · Necesito aprobación')}
        ${infoCard(`
          ${sectionLabel('Solicitud')}
          <p style="color:${C.text};font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">Confirmar cita del Sr. Ramírez para el jueves</p>
          <p style="color:${C.sub};font-size:13px;line-height:1.7;margin:0">El Sr. Ramírez pidió reagendar su cita del miércoles al jueves 8:30. Necesito tu aprobación para confirmar con el Dr. García.</p>
        `, true)}
        ${btn('Responder ahora →', 'https://www.centinelia.mx/portal/xyz/requests/abc', { color: meerkat.color })}`,
        { meerkat, preheader: 'Nia: Confirmar cita Sr. Ramírez' },
      );
    })() },
  { id: 'request-neo',        title: 'Request Neo (zoom + shift right)', html: neoTestEmail() },
  { id: 'request-nova',       title: 'Request Nova (zoom fuerte)',       html: novaTestEmail() },
  { id: 'reminder',           title: 'Reminder 24h (Sofía monogram)',    html: reminderEmail() },
  { id: 'escalation',         title: 'Escalation 48h (Nia)',             html: escalationEmail() },
  { id: 'spam-digest',        title: 'Spam digest',                      html: spamDigestEmail() },
  { id: 'auto-mode-digest',   title: 'Auto-mode digest',                 html: autoModeDigestEmail() },
  { id: 'minutes-alert-80',   title: 'Minutes alert 82%',                html: minutesAlertEmail(82) },
  { id: 'minutes-alert-100',  title: 'Minutes alert 100% (paused)',      html: minutesAlertEmail(100) },
  { id: 'agent-paused',       title: 'Oficina pausada (falta pago)',     html: agentPausedEmail() },
  { id: 'payment-failed',     title: 'Pago fallido',                     html: paymentFailedEmail() },
  { id: 'welcome',            title: 'Welcome post-pago',                html: welcomeEmail() },
  { id: 'onboarding-welcome', title: 'Onboarding welcome',               html: onboardingWelcomeEmail() },
];

for (const t of templates) {
  writeFileSync(join(OUT_DIR, `${t.id}.html`), t.html);
}

const indexHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Centinelia · Email previews</title>
  <style>
    body { margin: 0; padding: 24px; background: #0a0518; font-family: -apple-system, system-ui, sans-serif; color: #F1EEFF; }
    h1 { font-size: 20px; margin: 0 0 4px; font-weight: 600; }
    p.desc { color: #8C7FB8; font-size: 13px; margin: 0 0 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 24px; }
    .card { background: #1D1141; border: 1px solid #3D2E6A; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
    .card h2 { font-size: 13px; margin: 0; padding: 12px 16px; border-bottom: 1px solid #3D2E6A; font-weight: 600; color: #F1EEFF; }
    iframe { width: 100%; height: 640px; border: 0; background: #120726; }
    .card a { color: #9B6DFF; text-decoration: none; font-size: 12px; padding: 8px 16px; border-top: 1px solid #3D2E6A; }
  </style>
</head>
<body>
  <h1>Centinelia · Email previews</h1>
  <p class="desc">Rediseño premium — ${templates.length} templates. Click en el link para abrir en tamaño completo.</p>
  <div class="grid">
    ${templates.map(t => `
      <div class="card">
        <h2>${t.title}</h2>
        <iframe src="${t.id}.html" title="${t.title}"></iframe>
        <a href="${t.id}.html" target="_blank">Abrir en pestaña →</a>
      </div>`).join('')}
  </div>
</body>
</html>`;

writeFileSync(join(OUT_DIR, 'index.html'), indexHtml);

console.log(`✓ ${templates.length} previews generados en ${OUT_DIR}/`);
console.log(`  Abre ${join(OUT_DIR, 'index.html')} en el navegador`);
