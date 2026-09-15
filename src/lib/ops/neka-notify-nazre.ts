/**
 * Notificacion interna a Nazre cuando Neka corre en modo NEKA_NOTIFY_ONLY.
 *
 * Mientras el plan API prod de Facturama no este contratado, Neka no puede
 * timbrar automatico. En vez de fallar el ciclo, manda un correo a Nazre con
 * todos los datos ya armados para que timbre manual en el portal Facturama o
 * SAT. Se registra un evento notify_sent en centinelia_billing por ciclo para
 * auditoria.
 *
 * Cuando se pague Facturama y se flip NEKA_NOTIFY_ONLY=false, esta ruta deja
 * de correr y neka-billing-cycle vuelve al flujo de emitir_ingreso_facturama
 * sin cambios en el resto del cron.
 */
import { sendViaTitan } from '@/lib/email/titan-smtp';
import type { CfdiInput } from '@/lib/invoicing/provider';
import type { CentineliaCliente } from '@/lib/billing/centinelia-clientes';

export interface NotifyNazreInvoiceInput {
  cliente:   CentineliaCliente;
  cfdi:      CfdiInput;
  cicloKey:  string;
  testMode:  boolean;
}

export interface NotifyNazreInvoiceResult {
  ok:      boolean;
  to:      string;
  error?:  string;
}

function moneyMx(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderConceptosRows(cfdi: CfdiInput): string {
  return cfdi.conceptos.map(c => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5">${c.descripcion}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;text-align:right">${c.cantidad}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;text-align:right">$${moneyMx(c.valorUnitario)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;text-align:right">$${moneyMx(c.importe)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;text-align:right">${c.iva != null ? '$' + moneyMx(c.iva) : '—'}</td>
    </tr>
  `).join('');
}

export async function notifyNazreToInvoice(
  input: NotifyNazreInvoiceInput,
): Promise<NotifyNazreInvoiceResult> {
  const { cliente, cfdi, cicloKey, testMode } = input;
  const to = process.env.NEKA_NOTIFY_TO ?? process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com';

  const facturamaUrl = testMode
    ? 'https://apisandbox.facturama.mx'
    : 'https://app.facturama.mx';
  const adminUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx')
    + '/admin/staff/neka/clientes';

  const modoLabel = testMode ? 'SANDBOX (test)' : 'PROD (real)';
  const subject = `[Neka] Toca facturar ${cliente.razon_social} — ciclo ${cicloKey}`;

  const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#1A0A3B;max-width:640px">
  <p style="margin:0 0 12px 0">Hola Nazre,</p>
  <p style="margin:0 0 12px 0">Hoy toca facturar a <strong>${cliente.razon_social}</strong>. Estoy en <strong>modo recordatorio</strong> mientras el plan API prod de Facturama no este contratado — no timbro yo, te aviso a ti con los datos listos.</p>

  <h3 style="margin:20px 0 8px 0;color:#6C3BFF">Datos del cliente</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:4px 10px;color:#6b7280;width:180px">RFC</td><td style="padding:4px 10px"><code>${cliente.rfc}</code></td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Razon social</td><td style="padding:4px 10px">${cliente.razon_social}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">CP fiscal</td><td style="padding:4px 10px">${cliente.cp}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Regimen fiscal</td><td style="padding:4px 10px">${cliente.regimen_fiscal}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Uso CFDI</td><td style="padding:4px 10px">${cliente.uso_cfdi_default}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Metodo pago</td><td style="padding:4px 10px">${cliente.metodo_pago_default}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Forma pago</td><td style="padding:4px 10px">${cliente.forma_pago_default}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Enviar CFDI a</td><td style="padding:4px 10px">${cliente.correo_facturacion}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Ciclo</td><td style="padding:4px 10px"><strong>${cicloKey}</strong></td></tr>
  </table>

  <h3 style="margin:20px 0 8px 0;color:#6C3BFF">Conceptos</h3>
  <table style="border-collapse:collapse;width:100%;font-size:14px;border-top:2px solid #6C3BFF">
    <thead>
      <tr style="background:#FAFBFF">
        <th style="padding:8px 10px;text-align:left">Descripcion</th>
        <th style="padding:8px 10px;text-align:right">Cant.</th>
        <th style="padding:8px 10px;text-align:right">Valor unit.</th>
        <th style="padding:8px 10px;text-align:right">Importe</th>
        <th style="padding:8px 10px;text-align:right">IVA</th>
      </tr>
    </thead>
    <tbody>${renderConceptosRows(cfdi)}</tbody>
    <tfoot>
      <tr><td colspan="3" style="padding:8px 10px;text-align:right;color:#6b7280">Subtotal</td><td style="padding:8px 10px;text-align:right">$${moneyMx(cfdi.subtotal)}</td><td></td></tr>
      <tr><td colspan="3" style="padding:4px 10px;text-align:right;color:#6b7280">IVA</td><td></td><td style="padding:4px 10px;text-align:right">$${moneyMx(cfdi.iva)}</td></tr>
      <tr><td colspan="3" style="padding:8px 10px;text-align:right"><strong>Total</strong></td><td colspan="2" style="padding:8px 10px;text-align:right"><strong>$${moneyMx(cfdi.total)} MXN</strong></td></tr>
    </tfoot>
  </table>

  <p style="margin:20px 0 8px 0;color:#6b7280;font-size:13px">Portal Facturama (<strong>${modoLabel}</strong>): <a href="${facturamaUrl}" style="color:#6C3BFF">${facturamaUrl}</a></p>
  <p style="margin:0 0 20px 0;color:#6b7280;font-size:13px">Admin cliente: <a href="${adminUrl}" style="color:#6C3BFF">${adminUrl}</a></p>

  <p style="margin:12px 0 0 0;font-size:13px;color:#6b7280">Cuando termines de timbrar en el portal, no hace falta tocar nada aca — la fecha_proxima_facturacion ya avanzo, no te vuelvo a molestar por este ciclo. El siguiente cron te avisa cuando toque el proximo.</p>

  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E8E3F5;font-size:12px;color:#6b7280">
    <p style="margin:0 0 4px 0"><strong style="color:#a16207">Neka</strong> · Facturista interna de Centinelia</p>
    <p style="margin:0">Modo recordatorio activo (NEKA_NOTIFY_ONLY=true)</p>
  </div>
</div>`;

  try {
    const res = await sendViaTitan({
      to, subject, html,
      fromDisplay: 'Neka Centinelia',
      saveToSent:  false,  // notif interna, no ensuciar el Sent de Neka
    });
    if (!res.ok) return { ok: false, to, error: res.error ?? 'sendViaTitan failed' };
    return { ok: true, to };
  } catch (e) {
    return { ok: false, to, error: (e as Error).message };
  }
}
