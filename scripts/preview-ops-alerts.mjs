// Standalone preview generator for the ops-alerts email.
// Inlines the email helpers from src/lib/email/send.ts so we do not need
// to spin up Next / tsx just to render an HTML file.
// Usage: node scripts/preview-ops-alerts.mjs   →   writes preview-ops-alerts.html
import { writeFileSync } from 'node:fs';

const LOGO_URL = 'https://www.centinelia.mx/logo-tagline.png';

const C = {
  bg:         '#120726',
  card:       '#1D1141',
  cardAccent: '#2A1B5C',
  border:     '#3D2E6A',
  accent:     '#9B6DFF',
  text:       '#F1EEFF',
  sub:        '#C8BEE8',
  mute:       '#8C7FB8',
  header:     '#FFFFFF',
};

// ── Helpers (mirrors src/lib/email/send.ts) ──────────────────────────────────

function shell(body) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <style>
    .force-white { background: #FFFFFF !important; background-color: #FFFFFF !important; }
  </style>
</head>
<body class="body" style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg};margin:0;padding:0">
    <tr>
      <td align="center" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg};padding:32px 16px 48px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%">
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
          <tr>
            <td bgcolor="${C.card}" style="background:${C.card};background-color:${C.card};border-radius:0 0 16px 16px;padding:32px">
              ${body}
            </td>
          </tr>
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

function badge(label, color = C.accent) {
  return `<div style="text-align:center;margin-bottom:20px">
    <span style="display:inline-block;background:${color}22;border:1px solid ${color}40;border-radius:20px;padding:6px 16px;color:${color};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${label}</span>
  </div>`;
}

function heading(title, sub) {
  return `<h1 style="color:${C.text};font-size:22px;font-weight:700;margin:0 0 ${sub ? '6px' : '24px'};text-align:center;line-height:1.3">${title}</h1>
  ${sub ? `<p style="color:${C.sub};font-size:13px;margin:0 0 24px;text-align:center">${sub}</p>` : ''}`;
}

function infoCard(content, accent = false) {
  const bg = accent ? '#3A2570' : C.cardAccent;
  const bd = accent ? '#5A3AA0' : C.border;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${bg}" style="background:${bg};background-color:${bg};border:1px solid ${bd};border-radius:12px;margin-bottom:16px">
    <tr><td bgcolor="${bg}" style="background:${bg};background-color:${bg};padding:20px">
      ${content}
    </td></tr>
  </table>`;
}

function btn(label, href, primary = true) {
  return `<div style="text-align:center;margin:24px 0 8px">
    <a href="${href}" style="display:inline-block;background:${primary ? 'linear-gradient(135deg,#6C3BFF,#9B6DFF)' : 'transparent'};border:${primary ? 'none' : `1.5px solid ${C.border}`};color:${primary ? '#fff' : C.sub};font-size:14px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:12px">${label}</a>
  </div>`;
}

function sectionLabel(text) {
  return `<p style="color:${C.mute};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">${text}</p>`;
}

// ── Sample data ──────────────────────────────────────────────────────────────
// Simulates a realistic pneumastudio account with 4 empleados sharing a
// pool of 400 tasks/month, ~87% consumed. This is the shape the cron sees.

const account = {
  portalEmail: 'studio@pneumastudio.mx',
  businessName: 'Pneuma Studio',
  poolUsed:  348,
  poolLimit: 400,
  resetStr:  '1 septiembre',
  agents: [
    { name: 'Nia',  used: 142 },
    { name: 'Nox',  used: 118 },
    { name: 'Niva', used:  72 },
    { name: 'Sofía', used: 16 },
  ],
};

// ── Renderer (mirrors src/app/api/cron/ops-alerts/route.ts) ──────────────────

function render(a) {
  const pct       = Math.round((a.poolUsed / a.poolLimit) * 100);
  const remaining = Math.max(0, a.poolLimit - a.poolUsed);
  const teamSize  = a.agents.length;
  const alertColor = pct >= 90 ? '#F87171' : '#FBBF24';

  const portalUrl = 'https://www.centinelia.mx/portal/SAMPLETOKEN?tab=cuenta#comprar';

  const topConsumers = [...a.agents]
    .filter(x => x.used > 0)
    .sort((x, y) => y.used - x.used)
    .slice(0, 3);

  const consumerRows = topConsumers.map(agt => {
    const share = a.poolUsed > 0 ? Math.round((agt.used / a.poolUsed) * 100) : 0;
    const shareBar = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">
        <tr>
          <td bgcolor="#3D2E6A" style="background:#3D2E6A;background-color:#3D2E6A;border-radius:4px;overflow:hidden">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="${Math.max(1, share)}%" bgcolor="#9B6DFF" style="background:#9B6DFF;background-color:#9B6DFF;height:5px;font-size:0;line-height:0">&nbsp;</td>
                <td style="height:5px;font-size:0;line-height:0">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    return `
      <tr>
        <td style="padding:10px 0 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="color:#F1EEFF;font-size:14px;font-weight:600">${agt.name}</td>
              <td style="color:#C8BEE8;font-size:13px;text-align:right"><strong style="color:#F1EEFF">${agt.used}</strong> tareas · ${share}%</td>
            </tr>
          </table>
          ${shareBar}
        </td>
      </tr>`;
  }).join('');

  const poolBar = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
      <tr>
        <td bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;border-radius:8px;overflow:hidden;padding:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="${Math.max(1, Math.min(100, pct))}%" bgcolor="${alertColor}" style="background:linear-gradient(90deg,${alertColor},#9B6DFF);background-color:${alertColor};height:12px;font-size:0;line-height:0">&nbsp;</td>
              <td style="height:12px;font-size:0;line-height:0">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const bigNumber = `
    <div style="text-align:center;margin:0 0 12px">
      <div style="font-size:64px;font-weight:800;color:${alertColor};line-height:1;letter-spacing:-0.03em;margin:0">${pct}<span style="font-size:36px;font-weight:700">%</span></div>
      <p style="color:#C8BEE8;font-size:13px;margin:10px 0 0">del pool compartido usado este mes</p>
    </div>`;

  const statsRow = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
      <tr>
        <td width="33%" align="center" style="padding:6px">
          <div style="color:#F1EEFF;font-size:20px;font-weight:700;line-height:1.2">${a.poolUsed}</div>
          <div style="color:#8C7FB8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">Usadas</div>
        </td>
        <td width="33%" align="center" style="padding:6px;border-left:1px solid #3D2E6A;border-right:1px solid #3D2E6A">
          <div style="color:#F1EEFF;font-size:20px;font-weight:700;line-height:1.2">${remaining}</div>
          <div style="color:#8C7FB8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">Restantes</div>
        </td>
        <td width="33%" align="center" style="padding:6px">
          <div style="color:#F1EEFF;font-size:20px;font-weight:700;line-height:1.2">${a.resetStr}</div>
          <div style="color:#8C7FB8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">Renueva</div>
        </td>
      </tr>
    </table>`;

  return shell(
    badge(`${pct}% DEL POOL USADO`, alertColor) +
    heading('El pool de tu equipo está por agotarse', a.businessName) +
    bigNumber +
    poolBar +
    statsRow +
    infoCard(`
      ${sectionLabel('Qué significa esto')}
      <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">Tus <strong style="color:#F1EEFF">${teamSize} ${teamSize === 1 ? 'empleado' : 'empleados'}</strong> comparten un pool mensual de <strong style="color:#F1EEFF">${a.poolLimit}</strong> tareas. Cada tarea es una acción de fondo: revisar tu bandeja, generar reportes semanales, aprender de conversaciones nuevas, etc.</p>
      <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0">Cuando el pool llegue al 100%, las tareas de fondo se pausan automáticamente hasta que compres tareas extras o llegue la renovación del <strong style="color:#F1EEFF">${a.resetStr}</strong>.</p>
    `) +
    (topConsumers.length > 1
      ? infoCard(`
          ${sectionLabel('Quiénes están consumiendo más')}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${consumerRows}
          </table>
        `, true)
      : '') +
    btn('Comprar tareas extras', portalUrl) +
    btn('Ver mi cuenta', portalUrl, false) +
    `<p style="color:#C8BEE8;font-size:12px;margin:24px 0 0;text-align:center">¿Crees que esto es un error? Respóndenos a <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF;text-decoration:none">hola@centinelia.mx</a>.</p>`
  );
}

const html = render(account);
writeFileSync(new URL('../preview-ops-alerts.html', import.meta.url), html);
console.log('Wrote preview-ops-alerts.html');
console.log(`Sample account: ${account.businessName} · pool ${account.poolUsed}/${account.poolLimit} (${Math.round(account.poolUsed / account.poolLimit * 100)}%)`);
