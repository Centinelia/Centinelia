// Notificaciones internas al owner (Nazre) para el pipeline de callback de landing.
//
// notifyOwnerFallback: pipeline auto falló — callback manual necesario en < 30 min.
// notifyOwnerNewLead:  prospecto llegó pero OTP no verificado todavía.
//
// sendEmail retorna bool, no lanza. Fallos de envío son silenciosos para no
// bloquear el pipeline (el lead igual quedó registrado en la tabla).

import { sendEmail } from '@/lib/email/send';

const OWNER_EMAIL = 'nazre20@gmail.com';

// Escape básico para no romper el HTML del correo si el prospect metió < o >
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Notifica al owner que el pipeline automático falló y el prospecto
 * necesita un callback manual en menos de 30 minutos.
 */
export async function notifyOwnerFallback(input: {
  requestId:       string;
  phone:           string;
  orgName:         string;
  orgDescription:  string;
  expectation:     string;
  reason:          string;
}): Promise<void> {
  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `[FALLBACK] Lead landing sin llamada auto: ${input.phone} — ${input.orgName}`,
    html: `
      <p>El pipeline automático de callback falló. Necesita callback manual.</p>
      <ul>
        <li><strong>Request ID:</strong> ${esc(input.requestId)}</li>
        <li><strong>Teléfono:</strong> ${esc(input.phone)}</li>
        <li><strong>Negocio:</strong> ${esc(input.orgName)}</li>
        <li><strong>Qué hace:</strong> ${esc(input.orgDescription)}</li>
        <li><strong>Qué quería probar:</strong> ${esc(input.expectation)}</li>
        <li><strong>Razón del fallback:</strong> ${esc(input.reason)}</li>
      </ul>
      <p><strong>Llamar en menos de 30 minutos.</strong></p>
    `,
  });
}

/**
 * Notifica al owner que llegó un nuevo prospecto desde la landing.
 * Se usa como complemento informativo al flujo automático (llega justo
 * después de que el prospect completa el form, antes de la verificación OTP).
 */
export async function notifyOwnerNewLead(input: {
  requestId:       string;
  phone:           string;
  orgName:         string;
  orgDescription:  string;
  expectation:     string;
}): Promise<void> {
  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `Nuevo lead landing: ${input.orgName} (${input.phone})`,
    html: `
      <p>Nuevo prospecto desde la landing. Verificación OTP pendiente.</p>
      <ul>
        <li><strong>Request ID:</strong> ${esc(input.requestId)}</li>
        <li><strong>Teléfono:</strong> ${esc(input.phone)}</li>
        <li><strong>Negocio:</strong> ${esc(input.orgName)}</li>
        <li><strong>Qué hace:</strong> ${esc(input.orgDescription)}</li>
        <li><strong>Qué quiere probar:</strong> ${esc(input.expectation)}</li>
      </ul>
    `,
  });
}
