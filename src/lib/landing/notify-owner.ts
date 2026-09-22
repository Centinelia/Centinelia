// Notificaciones al owner (hola@centinelia.mx) para el pipeline de callback demo landing.
//
// Usa los helpers de branding de src/lib/email/send.ts (shell, heading,
// badge, infoCard, sectionLabel, btn) para que los correos se vean
// consistentes con el resto de comunicaciones de Centinelia.

import { sendEmail, shell, heading, badge, infoCard, sectionLabel, btn } from '@/lib/email/send';

const OWNER_EMAIL = 'hola@centinelia.mx';

// Escape básico para no romper el HTML del correo si el prospect metió < o >
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Fila key/value dentro de un infoCard (label pequeño arriba, valor grande abajo)
function kvRow(label: string, value: string): string {
  return `
    <div style="margin-bottom:14px">
      <p style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 4px">${label}</p>
      <p style="color:#fff;font-size:14px;font-weight:500;margin:0;line-height:1.5">${value}</p>
    </div>
  `;
}

/**
 * Notifica al owner que el pipeline automático falló y necesita callback manual
 * en menos de 30 minutos.
 */
export async function notifyOwnerFallback(input: {
  requestId:       string;
  phone:           string;
  orgName:         string;
  orgDescription:  string;
  expectation:     string;
  reason:          string;
}): Promise<void> {
  const body = `
    ${badge('Fallback manual', '#F59E0B')}
    ${heading('Callback manual requerido', 'El pipeline automático no completó la llamada — llama al prospect en menos de 30 minutos.')}

    ${sectionLabel('Contacto')}
    ${infoCard(`
      ${kvRow('Teléfono', esc(input.phone))}
      ${kvRow('Negocio', esc(input.orgName))}
    `)}

    ${sectionLabel('Contexto del negocio')}
    ${infoCard(`
      ${kvRow('Qué hace', esc(input.orgDescription))}
      ${kvRow('Qué quería probar', esc(input.expectation))}
    `)}

    ${sectionLabel('Diagnóstico')}
    ${infoCard(`
      ${kvRow('Razón fallback', esc(input.reason))}
      ${kvRow('Request ID', esc(input.requestId))}
    `, true)}

    ${btn('Llamar ahora', `tel:+52${input.phone}`)}
  `;

  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `[Fallback] Callback manual: ${input.orgName} (${input.phone})`,
    html:    shell(body, { preheader: `Llama al prospect en menos de 30 min — ${input.reason}` }),
  });
}

/**
 * Notifica al owner que llegó un nuevo prospecto desde la landing.
 * Verificación OTP pendiente (informativo).
 */
export async function notifyOwnerNewLead(input: {
  requestId:       string;
  phone:           string;
  orgName:         string;
  orgDescription:  string;
  expectation:     string;
}): Promise<void> {
  const body = `
    ${badge('Nuevo lead')}
    ${heading('Nuevo lead desde landing', 'Verificación OTP pendiente — la llamada se dispara automáticamente cuando el prospect confirme.')}

    ${sectionLabel('Contacto')}
    ${infoCard(`
      ${kvRow('Teléfono', esc(input.phone))}
      ${kvRow('Negocio', esc(input.orgName))}
    `)}

    ${sectionLabel('Contexto del negocio')}
    ${infoCard(`
      ${kvRow('Qué hace', esc(input.orgDescription))}
      ${kvRow('Qué quiere probar', esc(input.expectation))}
    `)}

    ${sectionLabel('Referencia')}
    ${infoCard(`
      ${kvRow('Request ID', esc(input.requestId))}
    `, true)}
  `;

  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `Nuevo lead landing: ${input.orgName} (${input.phone})`,
    html:    shell(body, { preheader: `${input.orgName} — ${input.orgDescription.slice(0, 80)}` }),
  });
}
