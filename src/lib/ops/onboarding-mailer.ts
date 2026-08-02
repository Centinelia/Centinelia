import { sendEmail, shell, badge, heading, infoCard, btn, sectionLabel } from '@/lib/email/send';

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

const STATUS_COLOR: Record<string, string> = {
  completado: '#22C55E',
  en_proceso: '#6C3BFF',
  pendiente:  '#FBBF24',
  cancelado:  '#EF4444',
};

function stepsRows(steps: string[]): string {
  return steps.map((s, i) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px">
      <tr>
        <td width="28" valign="top" style="width:28px;padding:2px 12px 0 0">
          <div style="width:24px;height:24px;border-radius:50%;background:#3A2570;color:#9B6DFF;font-size:11px;font-weight:800;line-height:24px;text-align:center">${i + 1}</div>
        </td>
        <td valign="top">
          <p style="color:#F1EEFF;font-size:13px;line-height:1.6;margin:0">${s}</p>
        </td>
      </tr>
    </table>`).join('');
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

  return shell(
    `${badge('Onboarding', '#22C55E')}
    ${heading(`Bienvenido, ${clientName}`, `${businessName} · ${templateName}`)}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">
      Estamos muy contentos de que formes parte de <strong style="color:#F1EEFF">${businessName}</strong>. A continuación encontrarás los pasos de tu proceso de incorporación.
    </p>
    ${infoCard(`
      ${sectionLabel('Pasos del proceso')}
      ${stepsRows(steps)}
    `, true)}
    ${notes ? infoCard(`
      ${sectionLabel('Notas')}
      <p style="color:#F1EEFF;font-size:13px;line-height:1.7;margin:0">${notes}</p>
    `) : ''}
    ${btn('Completar mi onboarding →', submitUrl)}`,
    { preheader: `Bienvenido a ${businessName}: ${templateName}` },
  );
}

function onboardingStatusHtml(opts: {
  clientName:   string;
  businessName: string;
  templateName: string;
  status:       string;
  notes:        string | null;
}): string {
  const { clientName, businessName, templateName, status, notes } = opts;
  const statusKey = status.toLowerCase().replace(/\s/g, '_');
  const color = STATUS_COLOR[statusKey] ?? '#6C3BFF';

  return shell(
    `${badge(status, color)}
    ${heading('Actualización de tu onboarding', businessName)}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px">Hola ${clientName},</p>
    ${infoCard(`
      ${sectionLabel('Proceso')}
      <p style="color:#F1EEFF;font-size:15px;font-weight:600;margin:0 0 6px">${templateName}</p>
      <p style="color:${color};font-size:13px;font-weight:600;margin:0">Estado: ${status}</p>
    `, true)}
    ${notes ? infoCard(`
      ${sectionLabel('Notas')}
      <p style="color:#F1EEFF;font-size:13px;line-height:1.7;margin:0">${notes}</p>
    `) : ''}`,
    { preheader: `${templateName}: ${status}` },
  );
}
