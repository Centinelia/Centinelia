/**
 * Cron daily — cuando llega rep_reminder_at para una factura PPD pagada, Neka
 * manda un correo por factura para que Nazre timbre el REP (Complemento de
 * Pago) en el portal SAT o Facturama. Marca rep_reminder_sent_at para no
 * volver a molestar.
 *
 * Filtra:
 *   - tipo = cfdi_emitido
 *   - metodo_pago_cfdi = PPD  (implicito porque paid_at solo se setea con PPD)
 *   - paid_at IS NOT NULL
 *   - rep_reminder_at <= NOW()
 *   - rep_reminder_sent_at IS NULL
 *
 * (Un futuro paso: skip si ya existe un rep_emitido para ese cfdi_uuid. Para
 * hoy, el rep_reminder_sent_at es suficiente: al subir el REP en el admin la
 * UI puede tambien marcar sent_at, o Nazre lo cierra manual.)
 */
import { sendViaTitan } from '@/lib/email/titan-smtp';
import { createAdminClient } from '@/lib/supabase/admin';

export interface RepRemindersOpts {
  testMode: boolean;
}

export type RepRemindersResult =
  | { ok: true; procesados: number; enviados: number; errores: number }
  | { ok: false; error: string };

interface RepPendienteRow {
  id:              string;
  cliente_id:      string;
  cfdi_uuid:       string | null;
  monto:           number | null;
  paid_at:         string;
  rep_reminder_at: string;
  ciclo_key:       string | null;
  cliente:         { razon_social: string; rfc: string } | null;
}

function moneyMx(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function runRepReminders(opts: RepRemindersOpts): Promise<RepRemindersResult> {
  const supabase = createAdminClient();
  const to     = process.env.NEKA_NOTIFY_TO ?? process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  const { data, error } = await supabase
    .from('centinelia_billing')
    .select('id, cliente_id, cfdi_uuid, monto, paid_at, rep_reminder_at, ciclo_key, cliente:centinelia_clientes(razon_social, rfc)')
    .eq('tipo', 'cfdi_emitido')
    .not('paid_at', 'is', null)
    .is('rep_reminder_sent_at', null)
    .lte('rep_reminder_at', new Date().toISOString());

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = ((data ?? []) as unknown as RepPendienteRow[])
    .filter(r => r.cliente != null && r.cfdi_uuid);

  let enviados = 0;
  let errores  = 0;

  for (const row of rows) {
    const clienteName = row.cliente!.razon_social;
    const uuidShort   = row.cfdi_uuid!.slice(0, 8).toUpperCase();
    const modoLabel   = opts.testMode ? 'TEST' : 'PROD';
    const subject     = `[Neka] Toca emitir REP a ${clienteName} (${uuidShort}…)`;

    const link = `${appUrl}/admin/staff/neka/clientes?cliente=${row.cliente_id}#f-${row.id}`;

    const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#1A0A3B;max-width:640px">
  <p style="margin:0 0 12px 0">Hola Nazre,</p>
  <p style="margin:0 0 12px 0">
    <strong>${clienteName}</strong> pago la factura <span style="font-family:monospace">${row.cfdi_uuid}</span>
    el ${fmtDate(row.paid_at)}. Toca timbrar el <strong>REP (Complemento de Pago)</strong> en el portal
    SAT o Facturama; el SAT te da hasta 10 dias del mes siguiente al pago.
  </p>

  <table style="border-collapse:collapse;width:100%;font-size:14px;margin:12px 0">
    <tr><td style="padding:4px 10px;color:#6b7280;width:180px">Cliente</td><td style="padding:4px 10px">${clienteName} · <code>${row.cliente!.rfc}</code></td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">UUID Ingreso</td><td style="padding:4px 10px"><code>${row.cfdi_uuid}</code></td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Monto pagado</td><td style="padding:4px 10px"><strong>$${moneyMx(row.monto)} MXN</strong></td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Ciclo</td><td style="padding:4px 10px">${row.ciclo_key ?? '—'}</td></tr>
    <tr><td style="padding:4px 10px;color:#6b7280">Fecha pago</td><td style="padding:4px 10px">${fmtDate(row.paid_at)}</td></tr>
  </table>

  <p style="margin:12px 0">
    Cuando timbres el REP, sube el XML y PDF aca: <a href="${link}" style="color:#6C3BFF">${link}</a>
  </p>

  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E8E3F5;font-size:12px;color:#6b7280">
    <p style="margin:0 0 4px 0"><strong style="color:#a16207">Neka</strong> · Facturista interna de Centinelia</p>
    <p style="margin:0">REP reminders · ${modoLabel}</p>
  </div>
</div>`;

    const res = await sendViaTitan({ to, subject, html, fromDisplay: 'Neka Centinelia', saveToSent: false });
    if (!res.ok) {
      errores++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('centinelia_billing')
      .update({ rep_reminder_sent_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateErr) {
      errores++;
      continue;
    }
    enviados++;
  }

  return { ok: true, procesados: rows.length, enviados, errores };
}
