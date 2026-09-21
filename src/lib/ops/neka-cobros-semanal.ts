/**
 * Cron helper — lunes 9 AM MX (15:00 UTC). Neka lista todas las facturas
 * emitidas PPD que aun no han sido marcadas como pagadas (ultimos 90 dias) y
 * manda un correo agrupado por cliente a Nazre para que marque cuales ya
 * cobraron. El botón "Marcar pagada" arranca el schedule del REP.
 *
 * Modo B (segun [[handoff_neka_repositorio_facturas]]): Neka no adivina si te
 * pagaron, te lo pregunta cada semana. Menos ruido que reminders individuales
 * por factura y evita el falso positivo de asumir el pago.
 */
import { sendViaTitan } from '@/lib/email/titan-smtp';
import { createAdminClient } from '@/lib/supabase/admin';

export interface CobrosSemanalOpts {
  testMode: boolean;
}

export type CobrosSemanalResult =
  | { ok: true;  pendientes: number; sent: boolean }
  | { ok: false; pendientes: number; error: string };

interface FacturaPendienteRow {
  id:         string;
  cliente_id: string;
  cfdi_uuid:  string | null;
  monto:      number | null;
  created_at: string;
  ciclo_key:  string | null;
  cliente:    { razon_social: string; rfc: string } | null;
}

function moneyMx(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderClienteBlock(clienteName: string, rfc: string, facturas: FacturaPendienteRow[], appUrl: string, clienteId: string): string {
  const rows = facturas.map(f => {
    const uuidShort = (f.cfdi_uuid ?? 'sin-uuid').slice(0, 8).toUpperCase();
    const link = `${appUrl}/admin/staff/neka/clientes?cliente=${clienteId}#f-${f.id}`;
    return `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;font-family:monospace">${uuidShort}…</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;text-align:right">$${moneyMx(f.monto)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5">${f.ciclo_key ?? '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5">${fmtDate(f.created_at)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #E8E3F5;text-align:right"><a href="${link}" style="color:#6C3BFF">Marcar pagada</a></td>
      </tr>`;
  }).join('');

  const total = facturas.reduce((s, f) => s + (f.monto ?? 0), 0);

  return `
    <h3 style="margin:20px 0 8px 0;color:#6C3BFF">${clienteName} <span style="color:#6b7280;font-weight:normal;font-size:13px">· ${rfc}</span></h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px;border-top:2px solid #6C3BFF">
      <thead>
        <tr style="background:#FAFBFF">
          <th style="padding:8px 10px;text-align:left">UUID</th>
          <th style="padding:8px 10px;text-align:right">Monto</th>
          <th style="padding:8px 10px;text-align:left">Ciclo</th>
          <th style="padding:8px 10px;text-align:left">Emitida</th>
          <th style="padding:8px 10px;text-align:right">Accion</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="4" style="padding:6px 10px;text-align:right;color:#6b7280"><strong>Subtotal ${clienteName}</strong></td><td style="padding:6px 10px;text-align:right"><strong>$${moneyMx(total)} MXN</strong></td></tr>
      </tfoot>
    </table>`;
}

export async function runCobrosSemanal(opts: CobrosSemanalOpts): Promise<CobrosSemanalResult> {
  const supabase = createAdminClient();
  const to = process.env.NEKA_NOTIFY_TO ?? process.env.NAZRE_ADMIN_EMAIL ?? 'nazre20@gmail.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data, error } = await supabase
    .from('centinelia_billing')
    .select('id, cliente_id, cfdi_uuid, monto, created_at, ciclo_key, cliente:centinelia_clientes(razon_social, rfc)')
    .eq('tipo', 'cfdi_emitido')
    .is('paid_at', null)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, pendientes: 0, error: error.message };
  }

  const rows = ((data ?? []) as unknown as FacturaPendienteRow[])
    .filter(r => r.cliente != null);

  if (rows.length === 0) {
    return { ok: true, pendientes: 0, sent: false };
  }

  const porCliente = new Map<string, { name: string; rfc: string; facturas: FacturaPendienteRow[] }>();
  for (const r of rows) {
    const key = r.cliente_id;
    const bucket = porCliente.get(key) ?? { name: r.cliente!.razon_social, rfc: r.cliente!.rfc, facturas: [] };
    bucket.facturas.push(r);
    porCliente.set(key, bucket);
  }

  const bloques = Array.from(porCliente.entries())
    .map(([clienteId, b]) => renderClienteBlock(b.name, b.rfc, b.facturas, appUrl, clienteId))
    .join('');

  const totalMx = rows.reduce((s, f) => s + (f.monto ?? 0), 0);
  const modoLabel = opts.testMode ? 'TEST' : 'PROD';
  const subject = `[Neka] Cobros pendientes (${rows.length} facturas · $${moneyMx(totalMx)} MXN)`;

  const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#1A0A3B;max-width:720px">
  <p style="margin:0 0 12px 0">Hola Nazre,</p>
  <p style="margin:0 0 12px 0">
    Estas son las facturas emitidas <strong>PPD</strong> que aun no marcaste como pagadas
    (ultimos 90 dias). Cuando un cliente te pague, marca la factura correspondiente y yo
    te aviso 5 dias despues para que emitas el REP.
  </p>

  ${bloques}

  <p style="margin:20px 0 12px 0;font-size:13px;color:#6b7280">
    Total pendiente: <strong>$${moneyMx(totalMx)} MXN</strong> en ${rows.length} facturas.
  </p>

  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #E8E3F5;font-size:12px;color:#6b7280">
    <p style="margin:0 0 4px 0"><strong style="color:#a16207">Neka</strong> · Facturista interna de Centinelia</p>
    <p style="margin:0">Cobros semanal · ${modoLabel}</p>
  </div>
</div>`;

  const res = await sendViaTitan({ to, subject, html, fromDisplay: 'Neka Centinelia', saveToSent: false });
  if (!res.ok) {
    return { ok: false, pendientes: rows.length, error: res.error ?? 'sendViaTitan failed' };
  }
  return { ok: true, pendientes: rows.length, sent: true };
}
