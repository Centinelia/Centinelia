// Notificaciones internas al owner (Nazre) para el pipeline de callback de landing.
//
// notifyOwnerFallback: pipeline auto fallo — callback manual necesario en < 30 min.
// notifyOwnerNewLead:  prospecto llego pero OTP no verificado todavia.
//
// sendEmail retorna bool, no lanza. Fallos de envio son silenciosos para no
// bloquear el pipeline (el lead igual quedo registrado en la tabla).

import { sendEmail } from '@/lib/email/send';

const OWNER_EMAIL = 'nazre20@gmail.com';

/**
 * Notifica al owner que el pipeline automatico fallo y el prospecto
 * necesita un callback manual en menos de 30 minutos.
 */
export async function notifyOwnerFallback(input: {
  requestId: string;
  phone:     string;
  industry:  string;
  reason:    string;
}): Promise<void> {
  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `[FALLBACK] Lead landing sin llamada auto: ${input.phone}`,
    html: `
      <p>El pipeline automático de callback falló. Necesita callback manual.</p>
      <ul>
        <li><strong>Request ID:</strong> ${input.requestId}</li>
        <li><strong>Teléfono:</strong> ${input.phone}</li>
        <li><strong>Industria:</strong> ${input.industry}</li>
        <li><strong>Razón:</strong> ${input.reason}</li>
      </ul>
      <p><strong>Llamar en menos de 30 minutos.</strong></p>
    `,
  });
}

/**
 * Notifica al owner que llego un nuevo prospecto desde la landing.
 * Se usa para prospectos que no completaron la verificacion OTP
 * (o como complemento informativo al flujo automatico).
 */
export async function notifyOwnerNewLead(input: {
  requestId: string;
  phone:     string;
  industry:  string;
}): Promise<void> {
  await sendEmail({
    to:      OWNER_EMAIL,
    subject: `Nuevo lead landing: ${input.industry} (${input.phone})`,
    html: `
      <p>Nuevo prospecto desde la landing. Verificación OTP pendiente.</p>
      <ul>
        <li><strong>Request ID:</strong> ${input.requestId}</li>
        <li><strong>Teléfono:</strong> ${input.phone}</li>
        <li><strong>Industria:</strong> ${input.industry}</li>
      </ul>
    `,
  });
}
