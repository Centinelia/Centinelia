/**
 * Sender de correos de Neka para CFDIs/REPs — Titan SMTP desde
 * hola@centinelia.mx con firma consistente de Neka. Se usa desde:
 *   - cron neka-billing-cycle (facturación proactiva de Centinelia)
 *   - endpoint approve pagos pendientes
 *   - runner neka-email cuando timbra desde correo entrante
 *
 * Neka es la facturista INTERNA de Centinelia (timbra CFDIs a nombre de
 * Centinelia hacia sus clientes). Distinta de Nala, que es la variante
 * contratable que se vende al cliente para su propia facturación.
 *
 * Reemplaza el fallback a Resend/notificaciones@centinelia.mx para que el
 * cliente siempre vea el correo viniendo de hola@centinelia.mx con branding
 * de Neka (no del emisor fiscal Nazre).
 */
import { sendViaTitan } from '@/lib/email/titan-smtp';
import type { CfdiSender } from '@/lib/invoicing/facturama/emitir';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

/**
 * Cuerpo HTML de un correo de Neka con branding Centinelia + firma.
 *
 * Estructura:
 *   [logo Centinelia pequeño arriba]
 *   {cuerpo del correo}
 *   ─────────────────────────────
 *   [avatar Neka 56px] Neka · Facturista interna de Centinelia
 *                       Centinelia · hola@centinelia.mx
 *
 * Compatible con Gmail/Outlook/Titan webmail (table-based layout).
 */
export function nekaEmailHtml(bodyMarkdownOrHtml: string): string {
  // Asset por ahora reutiliza nala-avatar.png (Neka no tiene avatar propio
  // todavía — TODO en meerkat-roles.ts).
  const avatarUrl = `${BASE_URL}/meerkats/nala-avatar.png`;

  const signature = `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
      <tr>
        <td style="vertical-align:middle;padding-right:14px">
          <img src="${avatarUrl}" alt="Neka" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;background:#faf7ff;border:2px solid #a1620744" />
        </td>
        <td style="vertical-align:middle;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;color:#6b7280;line-height:1.5">
          <div style="margin:0 0 3px 0;font-size:14px"><strong style="color:#a16207">Neka</strong> <span style="color:#8C7FB8">· Facturista interna de Centinelia</span></div>
          <div style="margin:0"><a href="mailto:hola@centinelia.mx" style="color:#6C3BFF;text-decoration:none">hola@centinelia.mx</a></div>
        </td>
      </tr>
    </table>`;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1A0A3B;max-width:600px">${bodyMarkdownOrHtml}${signature}</div>`;
}

/**
 * Cuerpo default para correos donde Neka manda un CFDI o REP. Usa "Hola" en
 * frío porque no siempre sabemos el nombre del contacto.
 */
export function nekaCfdiBodyDefault(opts: {
  tipo: 'CFDI' | 'REP';
  monto: number;
  uuid: string;
  ciclo?: string;
}): string {
  const monto = `$${opts.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  const tipoLabel = opts.tipo === 'REP' ? 'complemento de pago' : 'factura';
  const preposicion = opts.tipo === 'REP' ? 'del' : 'de la';
  return `<p>Hola,</p>
<p>Te adjunto ${opts.tipo === 'REP' ? 'el' : 'la'} ${tipoLabel}${opts.ciclo ? ` del ciclo <strong>${opts.ciclo}</strong>` : ''} por <strong>${monto}</strong>.</p>
<p>UUID ${preposicion} ${tipoLabel}: <code>${opts.uuid}</code></p>
<p>Cualquier duda, respondo por este mismo correo.</p>`;
}

/**
 * Sender que va por Titan SMTP con display name "Neka Centinelia".
 * Los adjuntos (XML + PDF) se envían inline.
 */
export const nekaCfdiSender: CfdiSender = async ({ to, subject, html, attachments }) => {
  const wrapped = nekaEmailHtml(html);
  const result = await sendViaTitan({
    to,
    subject,
    html: wrapped,
    fromDisplay: 'Neka Centinelia',
    saveToSent: true,
    attachments,
  });
  if (!result.ok) {
    console.warn('[nekaCfdiSender] Titan SMTP falló:', result.error);
  }
  return result.ok;
};
