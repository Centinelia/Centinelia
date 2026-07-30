import { sendEmail } from '@/lib/email/send';

export async function sendOnboardingWelcome(opts: {
  to:           string;
  clientName:   string;
  businessName: string;
  templateName: string;
  submitUrl:    string;
  steps:        string[];
  notes:        string | null;
}): Promise<void> {
  const { to, clientName, businessName, templateName, submitUrl, steps, notes } = opts;

  await sendEmail({
    to,
    subject: `Bienvenido a ${businessName}: tu proceso de onboarding`,
    html:    onboardingWelcomeHtml({ clientName, businessName, templateName, submitUrl, steps, notes }),
  });
}

export async function sendOnboardingStatusUpdate(opts: {
  to:           string;
  clientName:   string;
  businessName: string;
  templateName: string;
  status:       string;
  notes:        string | null;
}): Promise<void> {
  const { to, clientName, businessName, templateName, status, notes } = opts;

  const statusLabels: Record<string, string> = {
    completado: 'Completado',
    en_proceso: 'En proceso',
    pendiente:  'Pendiente',
    cancelado:  'Cancelado',
  };

  await sendEmail({
    to,
    subject: `Actualización de onboarding: ${templateName}`,
    html:    onboardingStatusHtml({ clientName, businessName, templateName, status: statusLabels[status] ?? status, notes }),
  });
}

function onboardingWelcomeHtml(opts: {
  clientName:   string;
  businessName: string;
  templateName: string;
  submitUrl:    string;
  steps:        string[];
  notes:        string | null;
}): string {
  const { clientName, businessName, templateName, submitUrl, steps, notes } = opts;
  const BG     = '#120726';
  const CARD   = 'rgba(255,255,255,0.055)';
  const BORDER = 'rgba(255,255,255,0.10)';
  const TEXT   = '#e2e8f0';
  const SUB    = 'rgba(255,255,255,0.58)';
  const MUTE   = 'rgba(255,255,255,0.35)';
  const ACCENT = '#9B6DFF';
  const LOGO   = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/logo-tagline.png`;

  const stepsHtml = steps.map((s, i) => `
  <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px">
    <div style="width:24px;height:24px;border-radius:50%;background:rgba(108,59,255,0.15);border:1px solid rgba(108,59,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;color:${ACCENT}">${i + 1}</div>
    <p style="color:${TEXT};font-size:13px;margin:0;line-height:1.6;padding-top:3px">${s}</p>
  </div>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
      <tr>
        <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;padding:20px 32px">
          <img src="${LOGO}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
        </td>
      </tr>
    </table>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:20px;padding:6px 16px;color:#22c55e;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Onboarding</span>
      </div>
      <h1 style="color:${TEXT};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">¡Bienvenido, ${clientName}!</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${businessName} · ${templateName}</p>

      <p style="color:${TEXT};font-size:14px;line-height:1.7;margin:0 0 20px">
        Hola ${clientName}, estamos muy contentos de que formes parte de ${businessName}. A continuación encontrarás los pasos de tu proceso de incorporación.
      </p>

      <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:16px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 12px">Pasos del proceso</p>
        ${stepsHtml}
      </div>

      ${notes ? `
      <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="color:rgba(245,158,11,0.9);font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 6px">Notas</p>
        <p style="color:${TEXT};font-size:13px;line-height:1.7;margin:0">${notes}</p>
      </div>` : ''}

      <div style="text-align:center;margin-top:8px">
        <a href="${submitUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px">Completar mi onboarding</a>
      </div>
    </div>
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${MUTE};font-size:12px;margin:0">
        <a href="https://www.centinelia.mx" style="color:${MUTE};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:${ACCENT};text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function onboardingStatusHtml(opts: {
  clientName:   string;
  businessName: string;
  templateName: string;
  status:       string;
  notes:        string | null;
}): string {
  const { clientName, businessName, templateName, status, notes } = opts;
  const BG     = '#120726';
  const CARD   = 'rgba(255,255,255,0.055)';
  const BORDER = 'rgba(255,255,255,0.10)';
  const TEXT   = '#e2e8f0';
  const SUB    = 'rgba(255,255,255,0.58)';
  const MUTE   = 'rgba(255,255,255,0.35)';
  const ACCENT = '#9B6DFF';
  const LOGO   = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/logo-tagline.png`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
      <tr>
        <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;padding:20px 32px">
          <img src="${LOGO}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
        </td>
      </tr>
    </table>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      <h1 style="color:${TEXT};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">Actualización de tu onboarding</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${businessName}</p>

      <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:16px">
        <p style="color:${MUTE};font-size:11px;margin:0 0 4px">Proceso</p>
        <p style="color:${TEXT};font-size:15px;font-weight:600;margin:0 0 8px">${templateName}</p>
        <p style="color:${ACCENT};font-size:13px;font-weight:600;margin:0">Estado: ${status}</p>
      </div>

      ${notes ? `<p style="color:${SUB};font-size:13px;line-height:1.7;margin:0">${notes}</p>` : ''}
    </div>
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${MUTE};font-size:12px;margin:0">
        <a href="https://www.centinelia.mx" style="color:${MUTE};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:${ACCENT};text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
