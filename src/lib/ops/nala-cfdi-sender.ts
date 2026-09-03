/**
 * Sender de correos de Nala para CFDIs/REPs — Titan SMTP desde
 * hola@centinelia.mx con firma consistente de Nala. Se usa desde:
 *   - cron nala-billing-cycle (facturación proactiva)
 *   - endpoint approve pagos pendientes
 *   - runner nala-email cuando timbra desde correo entrante
 *
 * Reemplaza el fallback a Resend/notificaciones@centinelia.mx para que el
 * cliente siempre vea el correo viniendo de hola@centinelia.mx con branding
 * de Nala (no del emisor fiscal Nazre).
 */
import { sendViaTitan } from '@/lib/email/titan-smtp';
import type { CfdiSender } from '@/lib/invoicing/facturama/emitir';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

/**
 * Cuerpo HTML de un correo de Nala con branding Centinelia + firma.
 *
 * Estructura:
 *   [logo Centinelia pequeño arriba]
 *   {cuerpo del correo}
 *   ─────────────────────────────
 *   [avatar Nala 56px] Nala · Facturista
 *                      Centinelia · hola@centinelia.mx
 *
 * Compatible con Gmail/Outlook/Titan webmail (table-based layout).
 */
export function nalaEmailHtml(bodyMarkdownOrHtml: string): string {
  // Asset dedicado con la cara de Nala ya croppeada (fondo transparente).
  // Simplifica el HTML enormemente vs usar nala.png (cuerpo entero) con
  // márgenes/scale que Gmail strippea.
  const avatarUrl = `${BASE_URL}/meerkats/nala-avatar.png`;

  // Firma sin border-top (Gmail lo detecta como "cutoff" y colapsa la firma
  // bajo los 3 puntos). Usamos un pequeño margin y un div wrapper con
  // background sutil para separar visualmente sin engañar el algoritmo de
  // truncado de Gmail.
  //
  // Avatar 56px circular. Usamos nala-avatar.png que ya viene con la cara
  // croppeada y centrada, así que object-fit:cover llena el círculo sin
  // necesidad de márgenes negativos ni transforms (que Gmail strippea).
  const signature = `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
      <tr>
        <td style="vertical-align:middle;padding-right:14px">
          <img src="${avatarUrl}" alt="Nala" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;background:#faf7ff;border:2px solid #a1620744" />
        </td>
        <td style="vertical-align:middle;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;color:#6b7280;line-height:1.5">
          <div style="margin:0 0 3px 0;font-size:14px"><strong style="color:#a16207">Nala</strong> <span style="color:#8C7FB8">· Facturista de Centinelia</span></div>
          <div style="margin:0"><a href="mailto:hola@centinelia.mx" style="color:#6C3BFF;text-decoration:none">hola@centinelia.mx</a></div>
        </td>
      </tr>
    </table>`;

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;color:#1A0A3B;max-width:600px">${bodyMarkdownOrHtml}${signature}</div>`;
}

/**
 * Cuerpo default para correos donde Nala manda un CFDI o REP. Usa "Hola" en
 * frío porque no siempre sabemos el nombre del contacto. Si el caller quiere
 * personalizar (ej. "Hola Beatriz"), pasa un customBody a la tool.
 */
export function nalaCfdiBodyDefault(opts: {
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
 * Sender que va por Titan SMTP con display name "Nala Centinelia".
 * Los adjuntos (XML + PDF) se envían inline.
 */
export const nalaCfdiSender: CfdiSender = async ({ to, subject, html, attachments }) => {
  // Envuelve el HTML del caller con estilos + firma Nala. El caller (orchestrator)
  // solo genera el body core con la calidez de Nala; aquí agregamos wrapping
  // consistente para que TODO correo saliente tenga el mismo branding.
  const wrapped = nalaEmailHtml(html);
  const result = await sendViaTitan({
    to,
    subject,
    html: wrapped,
    fromDisplay: 'Nala Centinelia',
    saveToSent: true,
    attachments,
  });
  if (!result.ok) {
    console.warn('[nalaCfdiSender] Titan SMTP falló:', result.error);
  }
  return result.ok;
};
